---
name: agentic-qa-core
description: "Foundation skill that (a) hosts shared references cited by other workflow skills (briefing template, dispatch patterns, orchestration doctrine) and (b) bootstraps a target repo with the boilerplate's foundation files (CLAUDE.md, .agents/, scripts/, package.json updates). Triggers on: `/agentic-qa-core init`, `agentic-qa bootstrap`, `setup agentic-qa foundation`, `regenerate CLAUDE.md`, `install boilerplate scripts`. Do NOT use for: syncing AI-critical docs (use `/sync-ai-memory`), adapting KATA tests (use `/adapt-framework`), or onboarding the target project (use `/project-discovery`)."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
---

# Agentic QA Core — Foundation references + bootstrap

`agentic-qa-core` is the skill that other skills assume already exists. It plays two distinct roles in the same package:

1. **Passive — shared reference library.** Workflow skills (`sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`, `project-discovery`) cite files under `references/` instead of duplicating the same briefing template, dispatch patterns and orchestration doctrine inside every skill. Loading a workflow skill therefore implies loading the relevant `agentic-qa-core/references/*.md` on demand.
2. **Active — bootstrap trigger.** When users adopt this boilerplate by downloading skills à la carte (e.g. cloning `.claude/skills/sprint-testing/` only), they end up missing the foundation files those skills depend on (`CLAUDE.md`, `.agents/project.yaml`, `scripts/agents-*.ts`, etc.). Invoking `/agentic-qa-core init` regenerates that foundation from the templates shipped under `templates/`.

Without `agentic-qa-core`, every other workflow skill would either silently rely on files that don't exist or copy-paste the same boilerplate-foundation paragraphs into its own `references/`. This skill is the single source of truth for both.

---

## Two roles

| Role | Trigger | Consumers |
|------|---------|-----------|
| **Reference library (passive)** | Other skills loading on-demand | `sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`, `project-discovery`, `adapt-framework` |
| **Bootstrap (active)** | `/agentic-qa-core init`, `agentic-qa bootstrap`, `setup agentic-qa foundation` | End users adopting the boilerplate, or repairing a partial install |

Passive role: nobody invokes `agentic-qa-core` directly to read a reference — they just cite `agentic-qa-core/references/<file>.md` and the AI loads it. Active role: only the user invokes it, and only when foundation files are missing.

---

## Init: write order

Bootstrap writes files in **this exact order**. Each step is justified by what depends on what:

1. **`.agents/project.yaml`** — template variable source. Skills resolve `{{VAR}}` against this. Nothing depends on it yet at this point in the install, so write it first.
2. **`.agents/jira-required.yaml`** — manifest of Jira custom fields AND `work_types:` (issue types + canonical statuses + canonical transitions) the methodology requires. Read by `scripts/check-jira-setup.ts`, `scripts/sync-jira-workflows.ts`, and `scripts/agents-lint.ts`.
3. **`.agents/jira-fields.json`** — empty stub (`{}`). Real catalog is written later by `bun run jira:sync-fields`. Documented in `templates/jira-fields.json.template` so the file exists from minute zero.
4. **`.agents/jira-workflows.json`** — empty shell with one entry per declared `work_type` (e.g. `{"story": {...}, "bug": {...}, "test_case": {...}}` with `null`/`{}` placeholders). Real catalog is written later by `bun run jira:sync-workflows`. Documented in `templates/jira-workflows.json.template` so the file exists from minute zero.
5. **`scripts/agents-setup.ts` + `scripts/agents-lint.ts` + `scripts/sync-jira-fields.ts` + `scripts/sync-jira-workflows.ts` + `scripts/check-jira-setup.ts`** — the five CLIs that operate on the four files above. Source files live as `templates/scripts/*.ts.template` (the `.template` suffix keeps them out of this repo's `tsconfig`/`eslint` scope, since they aren't live source code here); strip the `.template` suffix when writing to the destination `scripts/` directory. Order within this group does not matter.
6. **`package.json`** (penultimate) — merged: declared `dependencies` and `scripts` from `templates/package.json.partial.json` are added to the existing `package.json` if one exists; otherwise the partial is the seed for a fresh `package.json`. **Mandatory step:** without this merge, none of the five scripts written in step 5 are invocable via `bun run …`.
7. **`CLAUDE.md`** + symlink **`CLAUDE.md → CLAUDE.md`** (last). `CLAUDE.md` cites every file written in steps 1-6, so it must be written after all of them. The `CLAUDE.md → CLAUDE.md` symlink must be created after the real file exists.

Files MUST NOT be reordered. The dependency chain is real: a user who runs the bootstrap halfway and then types `bun run agents:setup` would otherwise hit "missing script" errors.

**Post-bootstrap order for the user.** After `init` completes, the report should instruct the user to run, in this exact order:

1. `bun run agents:setup` — fill `.agents/project.yaml` interactively.
2. `bun run jira:sync-fields` — populate `.agents/jira-fields.json` from their Jira workspace.
3. `bun run jira:sync-workflows` — populate `.agents/jira-workflows.json` from their Jira workspace (interactive on first run for canonical slugs that don't auto-resolve to a workflow's real status / transition names).
4. `bun run jira:check` — validate that BOTH catalogs satisfy the manifest (custom fields + `work_types`).
5. `bun run lint:agents` — confirm every project-variable and Jira reference (custom fields, work types, statuses, transitions) resolves.

---

## Init: idempotency

For each file written in steps 1-7:

- **If the destination file does not exist** → copy the corresponding template, report `WROTE <path>`.
- **If the destination file already exists** → do NOT overwrite, report `SKIPPED <path> (already present)`.

**Exception — step 6 (`package.json`)**: never overwrite. Read the existing `package.json`, merge in the `dependencies` and `scripts` declared in `templates/package.json.partial.json` (only adding keys that are not already present; never modifying existing keys), and write back. If `package.json` does not exist at all, copy the partial verbatim and report `WROTE package.json (from partial)`.

The `init` action never deletes files, never modifies values in existing files (only adds), and never runs `bun install`. Surface deps that need to be installed in the report so the user can run `bun install` themselves.

---

## Init: platform

| Platform | `CLAUDE.md` strategy |
|----------|----------------------|
| Linux / macOS | Symlink: `ln -s CLAUDE.md CLAUDE.md` |
| Windows | Copy: write the same bytes as `CLAUDE.md` to `CLAUDE.md`, then warn the user: "On Windows we copied CLAUDE.md → CLAUDE.md. Keep the two in sync manually, or convert to a symlink with admin rights." |

Detect platform from `process.platform`. Symlinks on Windows require either admin rights or developer mode; defaulting to copy avoids permission prompts during bootstrap.

---

## References cited by other skills

| File | Cited by | Purpose |
|------|----------|---------|
| `references/briefing-template.md` | `sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`, `project-discovery` | The 6-component subagent briefing template, with concrete filled examples per dispatch pattern. |
| `references/dispatch-patterns.md` | All workflow skills with a "Subagent Dispatch Strategy" section | Decision table + heuristic for picking Single / Sequential / Parallel / Background. |
| `references/orchestration-doctrine.md` | Subagents that need orchestration rules without pulling the whole `CLAUDE.md` | Cacheable mirror of `CLAUDE.md` §"Orchestration Mode (Subagent Strategy)". |

When a skill cites one of these, it includes a Dependencies block at the top (see next section) so the AI knows to load `agentic-qa-core` before continuing.

---

## Dependency declaration for downstream skills

Every workflow skill that cites `agentic-qa-core/references/*.md` should declare it explicitly so the AI knows what to load on demand. Example block to add near the top of the skill's `SKILL.md`:

```markdown
## Dependencies
Requires `agentic-qa-core`. Loads on demand:
- agentic-qa-core/references/briefing-template.md
- agentic-qa-core/references/dispatch-patterns.md
```

The block is documentation — the AI reads it and pulls the cited files. There is no automated wiring: skills are markdown, not code.

---

## Source of truth contract

`templates/CLAUDE.md.template` is a **byte-equivalent mirror** of the live `CLAUDE.md` at the repo root. Any change to a structural section in one MUST be applied to the other in the same commit. Structural sections include:

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

**Project-specific FACTS** (Project Identity table, Environment URLs, Discovery Progress, etc.) are NOT mirrored. Those are populated per-project by `/sync-ai-memory` and live only in the live `CLAUDE.md`. The template keeps them as `[PLACEHOLDER]` rows so a fresh bootstrap surfaces them as TODOs.

This contract is enforced by convention, not tooling — a future linter could diff the two files but is out of scope here.

The same contract applies to `templates/project.yaml.template`, `templates/jira-required.yaml.template`, and the five script templates (`agents-setup.ts.template`, `agents-lint.ts.template`, `sync-jira-fields.ts.template`, `sync-jira-workflows.ts.template`, `check-jira-setup.ts.template`): they are byte-equivalent mirrors of their live counterparts at the repo root. When the live file evolves, update the template in the same commit.

> **Note on `jira-fields.json.template` and `jira-workflows.json.template`**: both are shipped as empty stubs (`jira-fields.json.template` is `{}`; `jira-workflows.json.template` is a shell with one entry per declared `work_type` and `null`/`{}` placeholders). The real catalogs are generated by running `bun run jira:sync-fields` and `bun run jira:sync-workflows` against the user's Jira workspace AFTER bootstrap completes. The bootstrap report should mention these follow-up steps.

---

## Out of scope

`agentic-qa-core` does not:

- Create or modify `.context/` files (that belongs to `/project-discovery`).
- Generate or scaffold tests, fixtures, or KATA components (that belongs to `/adapt-framework` and `/test-automation`).
- Adapt the framework to a specific stack (that belongs to `/adapt-framework`).
- Sync AI-critical documents or project-specific facts in `CLAUDE.md` (that belongs to `/sync-ai-memory`).
- Sync OpenAPI / API schemas (that's `bun run api:sync`).
- Run any external command beyond file writes — no `bun install`, no `git`, no `gh`.

If a user invokes `/agentic-qa-core init` and then asks "now configure the project", route them to `/project-discovery`. If they ask "now wire the test fixtures", route them to `/adapt-framework`.
