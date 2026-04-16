# `.context/` Folder Audit — Boilerplate Shape Review

## Method

Enumerated every file in `.context/` on `refactor-with-skills` (29 files across 7 directories) and compared against legacy `origin/main` state. Each file classified against the core boilerplate principle:

**`.context/` should contain ONLY:**
- **(A) Example content** — sample filled content for a real product-under-test (acting as a worked example)
- **(B) Scaffolding** — READMEs and empty placeholder directories that instruct cloners how to populate the folder for their own project

**`.context/` should NOT contain:**
- Meta-documentation about the boilerplate itself (migration reports, lessons learned, eval results, refactor history) → belongs in `docs/`

---

## Audit Table — all 29 files

| Path | Classification | Rationale | Proposed destination |
|---|---|---|---|
| `.context/README.md` | KEEP (scaffolding) | Explains how to use `.context/` for future users | — |
| `.context/business-data-map.md` | KEEP (example) | Sample filled business-data-map for the Auth example product-under-test | — |
| `.context/test-management-system.md` | **MOVE** | Describes the IQL methodology + 16-step SDLC. This is boilerplate teaching material, not product-under-test context. | `docs/methodology/test-management-system.md` (validate duplication with existing `docs/methodology/IQL-methodology.md` first) |
| `.context/PRD/business/README.md` | KEEP (scaffolding) | Guides users on how to populate the `PRD/business/` folder | — |
| `.context/PRD/README.md` | KEEP (scaffolding) | Explains PRD structure and discovery sources | — |
| `.context/SRS/README.md` | KEEP (scaffolding) | Explains SRS structure and discovery sources | — |
| `.context/PBI/README.md` | KEEP (scaffolding) | Defines PBI structure, templates, workflow | — |
| `.context/PBI/templates/module-context-template.md` | KEEP (scaffolding) | Template for users to copy per module | — |
| `.context/PBI/templates/PROGRESS-template.md` | KEEP (scaffolding) | Template for tracking cross-session progress | — |
| `.context/PBI/templates/ROADMAP-template.md` | KEEP (scaffolding) | Template for module roadmap | — |
| `.context/PBI/templates/SESSION-PROMPT-template.md` | KEEP (scaffolding) | Template for session entry point | — |
| `.context/PBI/auth/auth-test-plan.md` | KEEP (example) | Real example test plan for a sample Auth module | — |
| `.context/PBI/auth/test-specs/PROGRESS.md` | KEEP (example) | Real example progress tracker | — |
| `.context/PBI/auth/test-specs/ROADMAP.md` | KEEP (example) | Real example roadmap | — |
| `.context/PBI/auth/test-specs/SESSION-PROMPT.md` | KEEP (example) | Real example session entry point | — |
| `.context/PBI/auth/test-specs/AUTH-T01-.../spec.md` | KEEP (example) | Real example business-level spec in Gherkin | — |
| `.context/PBI/auth/test-specs/AUTH-T01-.../implementation-plan.md` | KEEP (example) | Real example technical implementation plan | — |
| `.context/PBI/auth/test-specs/AUTH-T01-.../atc/UPEX-101-authenticate-successfully.md` | KEEP (example) | Real example ATC spec (API) | — |
| `.context/PBI/auth/test-specs/AUTH-T01-.../atc/UPEX-105-login-successfully.md` | KEEP (example) | Real example ATC spec (UI) | — |
| `.context/PBI/migration-analysis-agent-skills.md` | **MOVE** | Inventory of `.prompts/` → `.claude/skills/` migration. Describes the repo's own refactor history, not product-under-test content. | `docs/migrations/migration-analysis-agent-skills.md` |
| `.context/PBI/skill-creation-lessons.md` | **MOVE** | Lessons learned from building the skills. Internal boilerplate knowledge, not product context. | `docs/migrations/skill-creation-lessons.md` |
| `.context/PBI/eval-results/SUMMARY.md` | **MOVE** | Aggregate eval results for the 5 migrated skills. Migration artifact. | `docs/migrations/eval-results/SUMMARY.md` |
| `.context/PBI/eval-results/project-discovery.md` | **MOVE** | Per-skill eval report | `docs/migrations/eval-results/project-discovery.md` |
| `.context/PBI/eval-results/sprint-testing.md` | **MOVE** | Per-skill eval report | `docs/migrations/eval-results/sprint-testing.md` |
| `.context/PBI/eval-results/test-documentation.md` | **MOVE** | Per-skill eval report | `docs/migrations/eval-results/test-documentation.md` |
| `.context/PBI/eval-results/test-automation.md` | **MOVE** | Per-skill eval report | `docs/migrations/eval-results/test-automation.md` |
| `.context/PBI/eval-results/regression-testing.md` | **MOVE** | Per-skill eval report | `docs/migrations/eval-results/regression-testing.md` |
| `.context/PBI/eval-results/prompts-migration-audit.md` | **MOVE** | Audit of `.prompts/` → skills migration (written this session) | `docs/migrations/prompts-migration-audit.md` |
| `.context/PBI/eval-results/guidelines-migration-audit.md` | **MOVE** | Audit of `.context/guidelines/` → skills migration (written this session) | `docs/migrations/guidelines-migration-audit.md` |
| `.context/PBI/eval-results/context-folder-audit.md` | **MOVE** | This file — audit of `.context/` shape | `docs/migrations/context-folder-audit.md` |

---

## Summary of proposed moves

**To `docs/migrations/` (new folder)** — 11 files of meta-documentation:
- `migration-analysis-agent-skills.md`
- `skill-creation-lessons.md`
- `eval-results/SUMMARY.md` + 5 per-skill eval reports
- 3 audits written in this session (prompts, guidelines, context)

**To `docs/methodology/`** — 1 file (verify duplication first):
- `test-management-system.md` (may overlap with existing `IQL-methodology.md`)

After moves, `.context/PBI/eval-results/` becomes empty and can be removed.

---

## Current `docs/` structure (for reference)

```
docs/
├── README.md
├── context-engineering.md
├── architectures/supabase-nextjs/     (4 files)
├── methodology/                       (7 files incl. IQL-methodology.md)
├── setup/                             (4 files)
├── testing/
│   ├── api/                           (7 files)
│   ├── automation/                    (6 files)
│   └── database/                      (4 files)
└── workflows/                         (5 files incl. git-flow.md, test-*-lifecycle.md)
```

Proposed addition: `docs/migrations/` (+ optional `docs/migrations/eval-results/` subfolder).

---

## Cross-reference with legacy `origin/main`

Files **added on `refactor-with-skills` that never existed on legacy**:
- `.context/PBI/migration-analysis-agent-skills.md` — ✗ meta-doc, should move
- `.context/PBI/skill-creation-lessons.md` — ✗ meta-doc, should move
- `.context/PBI/eval-results/*.md` — ✗ meta-doc, should move

Files **removed on `refactor-with-skills` that existed on legacy**:
- All of `.context/guidelines/` — ✓ correctly absorbed into `.claude/skills/` references (see `guidelines-migration-audit.md`)

Files **unchanged, correctly kept**:
- All READMEs, `business-data-map.md`, `test-management-system.md` (though this last one should still move to `docs/`), `PBI/auth/` example, `PBI/templates/`.

---

## Verdict

**`.context/` is partially boilerplate-shaped.** The scaffolding (READMEs + templates) is correct. The sample Auth module is an excellent worked example. What breaks the principle are the 11 meta-documentation files that accumulated in `.context/PBI/` as working artifacts during the migration sprint — they describe the boilerplate's own refactor, not a product-under-test.

**Root cause:** `.context/PBI/` was used as a convenient scratch-pad during the migration. Now that the migration is complete, the scratch-pad artifacts should be relocated to `docs/migrations/` where they become proper maintainer-facing documentation.

**After cleanup:** `.context/` will contain exactly what a fresh cloner should see — scaffolds, templates, and a single filled example. Nothing in `.context/` will refer to the boilerplate's internal history.

**Non-disruptive:** None of these files are referenced from skills or CLI scripts (verify with grep before committing the move). Moving them does not break any runtime behavior — they are pure documentation.
