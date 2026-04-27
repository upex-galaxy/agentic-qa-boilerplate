---
name: framework-core
description: "Foundation skill that (a) hosts shared references cited by other workflow skills (briefing template, dispatch patterns, orchestration doctrine) and (b) bootstraps a target repo with the boilerplate's foundation files (AGENTS.md, .agents/, scripts/, package.json updates). Triggers on: `/framework-core init`, `framework bootstrap`, `setup framework foundation`, `regenerate AGENTS.md`, `install boilerplate scripts`. Do NOT use for: refreshing memory facts (use `/refresh-ai-memory`), adapting KATA tests (use `/adapt-framework`), or onboarding the target project (use `/project-discovery`)."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
---

# Framework Core — Foundation references + bootstrap

`framework-core` is the skill that other skills assume already exists. It plays two distinct roles in the same package:

1. **Passive — shared reference library.** Workflow skills (`sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`, `project-discovery`) cite files under `references/` instead of duplicating the same briefing template, dispatch patterns and orchestration doctrine inside every skill. Loading a workflow skill therefore implies loading the relevant `framework-core/references/*.md` on demand.
2. **Active — bootstrap trigger.** When users adopt this boilerplate by downloading skills à la carte (e.g. cloning `.claude/skills/sprint-testing/` only), they end up missing the foundation files those skills depend on (`AGENTS.md`, `.agents/project.yaml`, `scripts/agents-*.ts`, etc.). Invoking `/framework-core init` regenerates that foundation from the templates shipped under `templates/`.

Without `framework-core`, every other workflow skill would either silently rely on files that don't exist or copy-paste the same boilerplate-foundation paragraphs into its own `references/`. This skill is the single source of truth for both.

---

## Two roles

| Role | Trigger | Consumers |
|------|---------|-----------|
| **Reference library (passive)** | Other skills loading on-demand | `sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`, `project-discovery`, `adapt-framework` |
| **Bootstrap (active)** | `/framework-core init`, `framework bootstrap`, `setup framework foundation` | End users adopting the boilerplate, or repairing a partial install |

Passive role: nobody invokes `framework-core` directly to read a reference — they just cite `framework-core/references/<file>.md` and the AI loads it. Active role: only the user invokes it, and only when foundation files are missing.

---

## Init: write order

Bootstrap writes files in **this exact order**. Each step is justified by what depends on what:

1. **`.agents/project.yaml`** — template variable source. Skills resolve `{{VAR}}` against this. Nothing depends on it yet at this point in the install, so write it first.
2. **`.agents/jira-required.yaml`** — manifest of Jira custom fields the methodology requires. Read by `scripts/check-jira-setup.ts` and `scripts/agents-lint.ts`.
3. **`.agents/jira.json`** — empty stub (`{}`). Real catalog is written later by `bun run jira:sync-fields`. Documented in `templates/jira.json.template` so the file exists from minute zero.
4. **`scripts/agents-setup.ts` + `scripts/agents-lint.ts` + `scripts/sync-jira-fields.ts` + `scripts/check-jira-setup.ts`** — the four CLIs that operate on the three files above. Source files live as `templates/scripts/*.ts.template` (the `.template` suffix keeps them out of this repo's `tsconfig`/`eslint` scope, since they aren't live source code here); strip the `.template` suffix when writing to the destination `scripts/` directory. Order within this group does not matter.
5. **`package.json`** (penultimate) — merged: declared `dependencies` and `scripts` from `templates/package.json.partial.json` are added to the existing `package.json` if one exists; otherwise the partial is the seed for a fresh `package.json`. **Mandatory step:** without this merge, none of the four scripts written in step 4 are invocable via `bun run …`.
6. **`AGENTS.md`** + symlink **`CLAUDE.md → AGENTS.md`** (last). `AGENTS.md` cites every file written in steps 1-5, so it must be written after all of them. The `CLAUDE.md → AGENTS.md` symlink must be created after the real file exists.

Files MUST NOT be reordered. The dependency chain is real: a user who runs the bootstrap halfway and then types `bun run agents:setup` would otherwise hit "missing script" errors.

---

## Init: idempotency

For each file written in steps 1-6:

- **If the destination file does not exist** → copy the corresponding template, report `WROTE <path>`.
- **If the destination file already exists** → do NOT overwrite, report `SKIPPED <path> (already present)`.

**Exception — step 5 (`package.json`)**: never overwrite. Read the existing `package.json`, merge in the `dependencies` and `scripts` declared in `templates/package.json.partial.json` (only adding keys that are not already present; never modifying existing keys), and write back. If `package.json` does not exist at all, copy the partial verbatim and report `WROTE package.json (from partial)`.

The `init` action never deletes files, never modifies values in existing files (only adds), and never runs `bun install`. Surface deps that need to be installed in the report so the user can run `bun install` themselves.

---

## Init: platform

| Platform | `CLAUDE.md` strategy |
|----------|----------------------|
| Linux / macOS | Symlink: `ln -s AGENTS.md CLAUDE.md` |
| Windows | Copy: write the same bytes as `AGENTS.md` to `CLAUDE.md`, then warn the user: "On Windows we copied AGENTS.md → CLAUDE.md. Keep the two in sync manually, or convert to a symlink with admin rights." |

Detect platform from `process.platform`. Symlinks on Windows require either admin rights or developer mode; defaulting to copy avoids permission prompts during bootstrap.

---

## References cited by other skills

| File | Cited by | Purpose |
|------|----------|---------|
| `references/briefing-template.md` | `sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`, `project-discovery` | The 6-component subagent briefing template, with concrete filled examples per dispatch pattern. |
| `references/dispatch-patterns.md` | All workflow skills with a "Subagent Dispatch Strategy" section | Decision table + heuristic for picking Single / Sequential / Parallel / Background. |
| `references/orchestration-doctrine.md` | Subagents that need orchestration rules without pulling the whole `AGENTS.md` | Cacheable mirror of `AGENTS.md` §"Orchestration Mode (Subagent Strategy)". |

When a skill cites one of these, it includes a Dependencies block at the top (see next section) so the AI knows to load `framework-core` before continuing.

---

## Dependency declaration for downstream skills

Every workflow skill that cites `framework-core/references/*.md` should declare it explicitly so the AI knows what to load on demand. Example block to add near the top of the skill's `SKILL.md`:

```markdown
## Dependencies
Requires `framework-core`. Loads on demand:
- framework-core/references/briefing-template.md
- framework-core/references/dispatch-patterns.md
```

The block is documentation — the AI reads it and pulls the cited files. There is no automated wiring: skills are markdown, not code.

---

## Source of truth contract

`templates/AGENTS.md.template` is a **byte-equivalent mirror** of the live `AGENTS.md` at the repo root. Any change to a structural section in one MUST be applied to the other in the same commit. Structural sections include:

- Critical Rules
- Project Variables
- Tool Resolution
- Orchestration Mode
- Skills Available
- Commands Available
- Fundamental Rules
- Git Workflow
- Context System
- MCPs Available
- AI Behavior
- Local Context (PBI)
- CLI Tools
- Test Project Structure
- Quick Reference

**Project-specific FACTS** (Project Identity table, Environment URLs, Discovery Progress, etc.) are NOT mirrored. Those are populated per-project by `/refresh-ai-memory` and live only in the live `AGENTS.md`. The template keeps them as `[PLACEHOLDER]` rows so a fresh bootstrap surfaces them as TODOs.

This contract is enforced by convention, not tooling — a future linter could diff the two files but is out of scope here.

The same contract applies to `templates/project.yaml.template`, `templates/jira-required.yaml.template`, and the four script templates: they are byte-equivalent mirrors of their live counterparts at the repo root. When the live file evolves, update the template in the same commit.

> **Note on `jira.json.template`**: this is shipped as an empty stub `{}`. The real catalog is generated by running `bun run jira:sync-fields` against the user's Jira workspace AFTER bootstrap completes. The bootstrap report should mention this follow-up step.

---

## Out of scope

`framework-core` does not:

- Create or modify `.context/` files (that belongs to `/project-discovery`).
- Generate or scaffold tests, fixtures, or KATA components (that belongs to `/adapt-framework` and `/test-automation`).
- Adapt the framework to a specific stack (that belongs to `/adapt-framework`).
- Refresh project-specific facts in `AGENTS.md` (that belongs to `/refresh-ai-memory`).
- Sync OpenAPI / API schemas (that's `bun run api:sync`).
- Run any external command beyond file writes — no `bun install`, no `git`, no `gh`.

If a user invokes `/framework-core init` and then asks "now configure the project", route them to `/project-discovery`. If they ask "now wire the test fixtures", route them to `/adapt-framework`.
