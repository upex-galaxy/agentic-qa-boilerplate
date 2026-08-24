---
name: project-context
description: "Generate or refresh the canonical business context maps and master test plan. Use for business-data-map, business-feature-map, business-api-map, master-test-plan, refresh project context, refresh all context, entity map, feature inventory, API business map, or risk-ranked test roadmap. Routes exactly one mode at a time unless refresh-all is explicit. UPDATE mode always shows a diff and waits for approval before overwriting."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
complementary_categories: [testing-e2e, testing-api, meta-skill]
---

# Project Context

Own the four regenerative project-context artifacts without duplicating their workflows across harness commands.

## Compact Rules

- Exactly ONE mode per run: `data` · `features` · `api` · `test-plan` · `refresh-all`. Load only that mode's reference; never open a second one in the same pass.
- Mode → reference → output: `data` → `references/data.md` → `.context/business/business-data-map.md` · `features` → `references/features.md` → `.context/business/business-feature-map.md` · `api` → `references/api.md` → `.context/business/business-api-map.md` · `test-plan` → `references/test-plan.md` → `.context/master-test-plan.md`.
- User did not name a mode → ASK. NEVER infer `refresh-all` from a generic "refresh the context" request.
- `refresh-all` runs strictly `data` → `features` → `api` → `test-plan`, one at a time. Each reference's own validation and approval gate must close before the next is loaded. Never skip ahead.
- Artifact missing = CREATE mode: may write once the analysis completes. Artifact exists = UPDATE mode: generate a candidate, show the diff summary, WAIT for explicit approval. NEVER overwrite an existing artifact without that approval.
- Stop the run on a hard dependency failure or a rejected overwrite. A missing SOFT dependency is not a stop: record it as a Discovery Gap and continue, exactly as the selected reference defines.
- NEVER invent business facts. Read every source the selected reference requires; anything unverified belongs under the output's mandatory `## Discovery Gaps` section, not asserted in the body.
- After a successful artifact write, add the pointer to `AGENTS.md` ONLY when that pointer is missing. Never add operational prose to `CLAUDE.md`.
- Forward `$ARGUMENTS` unchanged to the selected mode.

**Read full SKILL.md when**: the requested mode is ambiguous, a `refresh-all` chain fails mid-sequence, or you need the selected reference's own analysis steps and validation gate.

## Mode routing

Resolve one mode from the invocation. Load only the reference named in that row.

| Mode | Legacy alias / trigger | Reference | Output |
|---|---|---|---|
| `data` | `business-data-map`, entity/data map | `references/data.md` | `.context/business/business-data-map.md` |
| `features` | `business-feature-map`, feature inventory | `references/features.md` | `.context/business/business-feature-map.md` |
| `api` | `business-api-map`, API business map | `references/api.md` | `.context/business/business-api-map.md` |
| `test-plan` | `master-test-plan`, risk-ranked test roadmap | `references/test-plan.md` | `.context/master-test-plan.md` |
| `refresh-all` | refresh all project context | all four references, one at a time | all four outputs |

If the user does not identify a mode, ask which artifact to refresh. Do not infer `refresh-all` from a generic request.

## `refresh-all` dependency order

Run sequentially and complete each reference's own validation and approval gate before loading the next:

1. `data`
2. `features`
3. `api`
4. `test-plan`

Stop on a hard dependency failure or rejected overwrite. Do not skip ahead. Missing soft dependencies remain Discovery Gaps exactly as each reference defines.

## Shared contract

- Read every available source required by the selected reference. Never invent business facts.
- CREATE mode may write the missing artifact after analysis.
- UPDATE mode must generate a candidate, show the diff summary, and wait for explicit approval before overwriting.
- Each output includes `## Discovery Gaps` for unverified facts.
- After a successful artifact write, update the canonical instruction/context pointers in `AGENTS.md` only when a pointer is missing. Never add operational prose to `CLAUDE.md`.
- `$ARGUMENTS` are forwarded unchanged to the selected mode.
