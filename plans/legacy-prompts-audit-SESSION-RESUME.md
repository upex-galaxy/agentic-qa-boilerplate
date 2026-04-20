# Legacy Prompts Audit — Session Resume

> **Purpose**: hand-off document so the next session can pick up this work cold without re-reading transcript history.
> **Last session date**: 2026-04-19
> **Working directory**: `/home/sai/Desktop/upex/web-apps/agentic-qa-boilerplate`

---

## What this work is about

We migrated a legacy prompt-based QA boilerplate (`upex-galaxy/ai-driven-test-automation-boilerplate`, `.prompts/**` architecture) to a **skills-first architecture** (`.claude/skills/` + `.claude/commands/`). The user asked me to audit whether any content of value was lost during that migration.

Two prior sessions already did the bulk of the reorganization:
- **Session 1** (`plans/skills-reorg-plan.md`) — moved prompts into skills + created 3 new commands (`/refresh-ai-memory`, `/master-test-plan`, `/business-api-map`) + moved business maps to `.context/mapping/`
- **Session 2** (`plans/prompt-cleanup-plan.md`) — removed `SESSION-PROMPT.md` templates, made docs/guidelines agnostic, unified "system prompt" → "AI memory file" terminology

My job in this session was the **verification audit**: compare 61 legacy prompts vs. the current skills/commands, flag gaps, and verify each suspect case with actual file reads and legacy content fetches.

---

## Documents you must read (in this order)

| # | Path | Purpose |
|---|---|---|
| 1 | `plans/legacy-prompts-migration-audit.md` | **Main plan.** Mapping table (61 prompts → current targets), Top risks/gaps, Verification Roadmap (9 V-items with status) |
| 2 | `plans/legacy-prompts-verification-report.md` | Evidence report. Per-V-item artifact checklists with line references, verbatim quotes, diff notes |
| 3 | `plans/skills-reorg-plan.md` | Prior session 1 context (what moved where) |
| 4 | `plans/prompt-cleanup-plan.md` | Prior session 2 context (final cleanup) |
| 5 | `CLAUDE.md` | Project memory — architecture, skills table, rules |

Read 1 + 2 first — they are the source of truth for current status. Items 3 + 4 are historical context only.

---

## Status snapshot (as of 2026-04-19)

### Metric progression

| Metric | Start of audit | After Session 1+2 | After V-01..V-09 verification |
|---|---|---|---|
| Total legacy prompts | 61 | 61 | 61 |
| ✅ FULL | 47 (77%) | 53 (87%) | **57 (93%)** |
| ⚠️ PARTIAL | 13 (21%) | 7 (11%) | **4 (7%)** |
| ❌ GAP | 1 (2%) | 0 (0%) | **0 (0%)** |

### V-item verdicts (all verified)

| V | Topic | Verdict | Remediation |
|---|---|---|---|
| V-01 | test-automation-agent — recovery matrix + G1-G4 gates | ⚠️ PARTIAL | 🟥 HIGH |
| V-02 | UPEX bug-report verbatim | ⚠️ PARTIAL | 🟧 MEDIUM |
| V-03 | KATA adaptation artifacts | ✅ FULL | — |
| V-04 | ATP branch + label | ✅ FULL | — |
| V-05 | Assessment scorecards | ✅ FULL | — |
| V-06 | Review checklist codes | ⚠️ PARTIAL | 🟨 LOW (cosmetic) |
| V-07 | Planning templates (ROADMAP/PROGRESS) | ⚠️ PARTIAL | 🟧 MEDIUM |
| V-08 | feature-test-plan label | ✅ FULL | — |
| V-09 | New-coverage sanity (/refresh-ai-memory, /master-test-plan, sprint-orchestration) | ✅ FULL (1 minor) | 🟨 LOW |

---

## Concrete gaps still open (for remediation)

> These are the 6 remaining items from the 4 PARTIAL V-items. They do **not** have proposed patches yet — that's the next phase.

### 🟥 HIGH priority

1. **V-01** — Add to `test-automation/references/planning-playbook.md` (new §12 or new `orchestration-gates.md` reference):
   - **Interrupted-session recovery matrix**:
     ```
     | Has plan? | Has test code? | Resume from |
     | No  | No  | STEP 2 (Planning) |
     | Yes | No  | STEP 3 (Coding)   |
     | Yes | Yes | STEP 4 (Review)   |
     ```
   - **Max 2 revision loops** ceiling in Phase 3: *"If still not approved after 2 revision rounds, present all remaining issues to the user and ask for guidance."*
   - **Quality Gates G1-G4** table (G1 Plan→Code already exists as §10 Approval gate; need G2 Code→Review, G3 Review→Commit, G4 Progress updated).

### 🟧 MEDIUM priority

2. **V-02** — Add to `sprint-testing/references/reporting-templates.md` §1:
   - Restructured "Error Handling for Custom Fields" with literal: *"DO NOT attempt to discover or query for alternative field IDs. Inform the user with: {Custom Field Error template}. Create the bug anyway with the fields that work."*
   - "Custom Field Error" user-facing message template (exact wording from legacy)
   - 3-step non-UPEX fallback workflow (Search → Ask → Embed in Description)
   - Field Mapping Guide table (6 rows: UPEX name → common alternatives: Bug Severity / Defect Type / Found In / Cause Category / Actual Behavior / Expected Behavior)
   - Restore `(WAD)` parenthetical in "Working As Designed" §1.8 entry

3. **V-07** — Add to `test-automation/references/planning-playbook.md` §12 "Shared state files":
   - **ROADMAP.md template**: ticket index table, dependency graph, per-phase progress indicator
   - **PROGRESS.md template**: Current Status block + per-ticket rows + Session Log table + Shared Components Created list

### 🟨 LOW priority

4. **V-06** — Restore 5-row per-HTTP-method tuple-return table in `review-checklists.md` §3.2. Clarify DELETE semantics (legacy was `void`, local is `TBody` — which is correct?).

5. **V-06 cosmetic** — Add legacy-code mapping appendix to `review-checklists.md` (K-01 → new location, A-01 → new location, etc.) to preserve historical PR references.

6. **V-09 minor** — Add security-scan step to `/refresh-ai-memory` command (no creds / no prod URLs in generated README) to prevent accidental secret leakage.

---

## How to continue

### If the user says "do the remediation":

1. Read `plans/legacy-prompts-verification-report.md` §"Prioritized remediation backlog" in full.
2. Create `plans/legacy-prompts-remediation-plan.md` grouping the 6 items by file-of-change, ordered by priority.
3. Present the plan to the user; wait for approval.
4. Execute one file at a time, HIGH → MEDIUM → LOW. Read the target file before each edit.
5. After each remediation, update the plan with ✅ / ❌ status and move on.
6. After all remediations, update `plans/legacy-prompts-migration-audit.md` executive-summary metrics to reflect new status (projected: 61 FULL / 0 PARTIAL / 0 GAP).

### If the user says "verify something else" or "add a V-10":

- Follow the same protocol used in V-01..V-09 (read local + fetch legacy via `gh api` + per-artifact PRESENT/ADAPTED/MISSING verdict).
- Add the new V-item to the Verification Roadmap in `legacy-prompts-migration-audit.md`.
- Append a new section to `legacy-prompts-verification-report.md`.

### If the user asks about the architecture / skills / commands:

- Current skills (8): `acli`, `playwright-cli`, `project-discovery`, `regression-testing`, `sprint-testing`, `test-automation`, `test-documentation`, `xray-cli`
- Current commands (9): `business-api-map`, `business-data-map`, `business-feature-map`, `git-conflict-fix`, `git-flow`, `master-test-plan`, `refresh-ai-memory`, `test-execution-breakdown`, `traceability-fix`
- Business maps centralized in `.context/mapping/` (3 stubs).
- Session resume for automation: no more `@-loadable` files; `/test-automation` reads `PROGRESS.md + ROADMAP.md` directly.

---

## Key facts to remember

- **User language**: default to English per CLAUDE.md; mirror Spanish in user-facing chat if the user writes Spanish.
- **No AI attribution**: never add "Co-Authored-By: Claude" or similar to commits.
- **Skills-first**: all operational workflows live in `.claude/skills/` or `.claude/commands/`. Never ask the user to copy-paste instructions.
- **Legacy repo**: `https://github.com/upex-galaxy/ai-driven-test-automation-boilerplate` (branch `main`). Fetch content via `gh api repos/upex-galaxy/ai-driven-test-automation-boilerplate/contents/<path>?ref=main --jq '.content' | base64 -d`.
- **Bash style** (user's global CLAUDE.md): never chain commands with `&&` / `;` / `|` in a single Bash tool call — run each as a separate tool call.

---

## Audit lineage (chronology)

1. User asked for a mapping of `.prompts/**` → current skills, comparing against a legacy GitHub repo.
2. I produced the **first audit**: 47 FULL / 13 PARTIAL / 1 GAP (61 total).
3. User informed me about Session 1 + Session 2 changes. I produced the **updated audit**: 53 FULL / 7 PARTIAL / 0 GAP, flagging 10 items in a Top risks table.
4. User asked me to save the audit + a **verification roadmap** to `plans/`. Done — `legacy-prompts-migration-audit.md`.
5. User asked me to explain the roadmap simply. Done (conversational).
6. User said "arranca". I ran V-01..V-09 sequentially (with parallel fetches where possible), writing **verdicts + evidence** to `plans/legacy-prompts-verification-report.md`.
7. User asked for this resume doc. You are reading it.

---

## File inventory (this session's writes)

| File | Status | Purpose |
|---|---|---|
| `plans/legacy-prompts-migration-audit.md` | **UPDATED** | Main plan; V-item status now shows verdicts + metric progression |
| `plans/legacy-prompts-verification-report.md` | **CREATED** | Evidence report; per-V-item artifact tables + remediation backlog |
| `plans/legacy-prompts-audit-SESSION-RESUME.md` | **CREATED** | This file (session handoff) |

No skill/command files were modified — the audit is read-only by design. Remediation is the next phase (pending user approval).

---

*End of resume. Next session should open `plans/legacy-prompts-migration-audit.md` first, then this file.*
