---
name: project-context
description: "Generate or refresh the business context maps (the HTML maps inside business-data-context, business-api-context and business-e2e-context) and the master test plan. Use for business-data-map, business-api-map, business-e2e-map, business-feature-map, user journeys map, master-test-plan, refresh project context, refresh all context, entity map, feature inventory, API business map, or risk-ranked test roadmap. Also scaffolds a project-owned <aspect>-context skill for any other aspect (context-skill mode). Routes exactly one mode at a time unless refresh-all is explicit. UPDATE regenerates only stale sections and always shows a diff and waits for approval before writing."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
complementary_categories: [testing-e2e, testing-api, meta-skill]
metadata:
  kind: workflow
  requires_capabilities: [db, api-schema, diagrams]
---

# Project Context

Own the regenerative project-context artifacts without duplicating their workflows across harness commands. The business maps live inside their context skills as HTML (`agentic-qa-core/references/business-context-maps.md`); this skill generates them and updates their stale sections.

## Compact Rules

- Exactly ONE mode per run: `data` · `e2e` (synonym `features`) · `api` · `test-plan` · `refresh-all` · `context-skill`. Load only that mode's reference; never open a second one in the same pass.
- `context-skill` scaffolds a project-owned `<aspect>-context` for an aspect the shipped context map skills (`CONTEXT_MAP_SKILLS`) do not cover (`../agentic-qa-core/references/skill-scaffold.md` §3): it cites its sources and never copies them. `refresh-all` never includes it.
- Mode → reference → output: see the Mode routing table. A map mode writes ONLY its own skill's `references/<map>.html`; the legacy markdown files a project may hold (the skill's `legacy` list in `CONTEXT_MAP_SKILLS`, `cli/lib/context-maps.ts`) are read as input and never deleted. Domain vocabulary and architecture come from the maps `project-discovery` generates: `bun run context:map business-domain-context` and `bun run context:map infra-context`, never a `.context/` file. `test-plan` → `references/test-plan.md` → the `## Master Test Plan` section of the `QA Master Test Plan` Epic description in Jira (cached by the sync at `.context/PBI/qa-artifacts/master-test-plan.md`; never a local file).
- User did not name a mode → ASK. NEVER infer `refresh-all` from a generic "refresh the context" request.
- `refresh-all` runs strictly `data` → `e2e` → `api` → `test-plan`, one at a time. Each reference's own validation and approval gate must close before the next is loaded. Never skip ahead.
- Artifact missing (or a placeholder map) = CREATE mode: may write once the analysis completes. Artifact exists = UPDATE mode: generate a candidate (for a map: only its stale sections), show the diff summary, WAIT for explicit approval. NEVER overwrite an existing artifact without that approval, and NEVER regenerate a whole generated map.
- Stop the run on a hard dependency failure or a rejected overwrite. A missing SOFT dependency is not a stop: record it as a Discovery Gap and continue, exactly as the selected reference defines.
- NEVER invent business facts. Read every source the selected reference requires; anything unverified belongs under the output's mandatory discovery-gaps section, not asserted in the body.
- After a successful artifact write, add the pointer to `AGENTS.md` ONLY when that pointer is missing. Never add operational prose to `CLAUDE.md`.
- Mode from `$ARGUMENTS`: when its first token matches a mode in the Mode routing table, that token IS the mode and the rest is forwarded to it unchanged (`/project-context data` on Claude Code, "project-context mode data" in prose on OpenCode and Codex). No matching first token → ASK which mode.
- Before any step that uses a declared capability (`metadata.requires_capabilities`: `db`, `api-schema`, `diagrams` for the maps' figures), run the point-of-use check in `agentic-qa-core/references/preflight-gate.md` §8: resolve by tool-name suffix, and when no available tool provides it STOP and name the capability + how to enable it, never a silent fallback.

**Read full SKILL.md when**: the requested mode is ambiguous, a `refresh-all` chain fails mid-sequence, or you need the selected reference's own analysis steps and validation gate.

## Mode routing

Resolve one mode from the invocation: the first token of `$ARGUMENTS` when it names a mode below (or `features`, the synonym of `e2e`), otherwise ask. Load only the reference named in that row. The former `business-*-map` and `master-test-plan` command names survive as trigger phrases only.

| Mode | Trigger phrases | Reference | Output |
|---|---|---|---|
| `data` | `business-data-map`, entity/data map | `references/data.md` | `.agents/skills/business-data-context/references/business-data-map.html` |
| `e2e` | `business-e2e-map`, `business-feature-map`, `features`, user journeys, feature inventory | `references/e2e.md` | `.agents/skills/business-e2e-context/references/business-e2e-map.html` |
| `api` | `business-api-map`, API business map | `references/api.md` | `.agents/skills/business-api-context/references/business-api-map.html` |
| `test-plan` | `master-test-plan`, risk-ranked test roadmap | `references/test-plan.md` | MTP Epic description in Jira (cache: `.context/PBI/qa-artifacts/master-test-plan.md`) |
| `refresh-all` | refresh all project context | all four references, one at a time | all four outputs |
| `context-skill` | `context skill`, scaffold `<aspect>-context` for another aspect | `references/context-skill.md` | `.agents/skills/<aspect>-context/` (project-owned, never shipped upstream) |

If the user does not identify a mode, ask which artifact to refresh. Do not infer `refresh-all` from a generic request.

## `refresh-all` dependency order

Run sequentially and complete each reference's own validation and approval gate before loading the next:

1. `data`
2. `e2e`
3. `api`
4. `test-plan`

Stop on a hard dependency failure or rejected overwrite. Do not skip ahead. Missing soft dependencies remain Discovery Gaps exactly as each reference defines.

## Shared contract

- Read every available source required by the selected reference. Never invent business facts.
- CREATE mode may write the missing artifact after analysis.
- UPDATE mode must generate a candidate, show the diff summary, and wait for explicit approval before overwriting.
- Each output includes `## Discovery Gaps` for unverified facts.
- After a successful artifact write, update the canonical instruction/context pointers in `AGENTS.md` only when a pointer is missing. Never add operational prose to `CLAUDE.md`.
- A map mode writes into a business context skill that already exists (delivered by `bun run up`, never scaffolded here). After it writes, the mode reviews that skill's `## Rules` and gotchas against the new map and PROPOSES any change; it never rewrites a rule.
- `$ARGUMENTS` minus the mode token are forwarded unchanged to the selected mode.
