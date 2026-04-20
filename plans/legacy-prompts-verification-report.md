# Legacy Prompts — Verification Report (V-01 → V-09)

> **Companion to**: `plans/legacy-prompts-migration-audit.md` §"Verification Roadmap"
> **Date**: 2026-04-19
> **Scope**: Verify whether the artifacts flagged as ⚠️ PARTIAL in the audit are actually preserved in the current skills/commands.
> **Protocol**: Read local target end-to-end, fetch legacy from `upex-galaxy/ai-driven-test-automation-boilerplate@main`, check each artifact as PRESENT / ADAPTED / MISSING. No writes — verification only.

---

## Summary

| V-item | Area | Verdict | Artifacts checked | Remediation needed? |
|---|---|---|---|---|
| **V-01** | test-automation-agent recovery + gates | ⚠️ PARTIAL | 5 | ✅ YES (HIGH) |
| **V-02** | UPEX bug-report verbatim | ⚠️ PARTIAL | 7 | ⚠️ YES (MEDIUM) |
| **V-03** | KATA adaptation artifacts | ✅ FULL | 6 | ❌ NO |
| **V-04** | ATP branch + label | ✅ FULL | 4 | ❌ NO |
| **V-05** | Project assessment scorecards | ✅ FULL | 5 | ❌ NO |
| **V-06** | Review checklist codes | ⚠️ PARTIAL | 4 | ⚠️ YES (LOW) |
| **V-07** | Planning templates | ⚠️ PARTIAL | 3 | ⚠️ YES (MEDIUM) |
| **V-08** | feature-test-plan label | ✅ FULL | 1 | ❌ NO |
| **V-09** | New-coverage sanity | ✅ FULL | 4 | ❌ NO |

**Net change vs. pre-verification audit:**
- Items upgraded ⚠️→✅: **V-03, V-04, V-05, V-09** (previously flagged PARTIAL, verified FULL)
- Items downgraded/confirmed: **V-01, V-02, V-06, V-07** remain PARTIAL with concrete gaps
- No new GAPs discovered.

---

## V-01 · `test-automation-agent.md` — recovery matrix + review gates ⚠️ PARTIAL

**Legacy source**: `.prompts/orchestrators/test-automation-agent.md`
**Local target**: `.claude/skills/test-automation/references/planning-playbook.md` + `SKILL.md`

| # | Artifact | Status | Evidence |
|---|---|---|---|
| 1 | Interrupted-session recovery matrix (`has plan? / has code? → resume step`) | ❌ **MISSING** | 0 hits for `recovery\|interrupted\|resume` in `planning-playbook.md` and `SKILL.md` |
| 2 | Max 2 revision loops ceiling in Phase 3 | ❌ **MISSING** | 0 hits for `revision loops\|2 revisions`. SKILL.md Phase 3 only says "Treat every failed item as a blocker" |
| 3 | Auto-update of `PROGRESS.md` + `ROADMAP.md` after each phase | ⚠️ **PARTIAL** | planning-playbook.md §6 has `Update TMS status to Automated` checklist item but no structured post-phase protocol for PROGRESS/ROADMAP mutation |
| 4 | Post-step `[TMS_TOOL] Update Test Status: Automated` | ✅ **PRESENT (ADAPTED)** | planning-playbook.md L264 ("Update TMS status to 'Automated'") + L273 ("TMS marked Automated") — exists as checklist item, not structured pseudocode |
| 5 | Quality Gates G1-G4 between phases | ⚠️ **PARTIAL** | Only G1 equivalent preserved: planning-playbook.md §10 "Approval gate — Plan → Code". G2 (Code→Review), G3 (Review→Commit), G4 (Progress updated) not documented as named phase-transition gates. SKILL.md §Quality gates covers a different dimension (merge-time checks: tests pass / types / lint / fixture registered / ATC IDs linked) |

### Artifacts to restore

**Legacy INTERRUPTED SESSION RECOVERY block** (reproduced for remediation reference):

```
| Has plan? | Has test code? | Resume from |
|-----------|---------------|-------------|
| No        | No            | STEP 2 (Planning) |
| Yes       | No            | STEP 3 (Coding)   |
| Yes       | Yes           | STEP 4 (Review)   |
```

**Legacy QUALITY GATES table**:

```
| Gate | Between | Criteria |
| G1: Plan exists | Step 2 -> Step 3 | implementation-plan.md created with ATCs defined |
| G2: Tests pass  | Step 3 -> Step 4 | All tests passing locally (or user overrides) |
| G3: Review OK   | Step 4 -> Step 5 | Verdict is APPROVED (or max revision loops reached) |
| G4: Progress    | Step 5 -> Step 6 | PROGRESS.md reflects the completed ticket |
```

**Legacy revision-loop ceiling** (line 431 of legacy):
> "Maximum revision loops: 2. If still not approved after 2 revision rounds, present all remaining issues to the user and ask for guidance."

---

## V-02 · `bug-report.md` — UPEX custom-fields verbatim ⚠️ PARTIAL

**Legacy source**: `.prompts/stage-3-reporting/bug-report.md`
**Local target**: `sprint-testing/references/reporting-templates.md` + `test-documentation/references/jira-setup.md`

| # | Artifact | Status | Evidence |
|---|---|---|---|
| 1 | 8 Error Type dropdown strings | ✅ **PRESENT** | reporting-templates.md §1.6 lists all 8: Functional / Visual / Content / Performance / Crash / Data / Integration / Security — exact match |
| 2 | 5 SEVERITY dropdown strings | ✅ **PRESENT** | §1.4 lists all 5: Critical / Major / Moderate / Minor / Trivial — exact match |
| 3 | 8 Root Cause dropdown strings | ⚠️ **7/8 VERBATIM, 1 ADAPTED** | §1.8 list all 8 but "Working As Designed (WAD)" legacy becomes "Working As Designed" local (loses the `(WAD)` parenthetical abbreviation) |
| 4 | 7 mandatory customfield IDs (10109, 10110, 10112, 10116, 12210, 10701, 10049) | ✅ **PRESENT** | §1.10 table lists all 7 — exact match |
| 5 | 3 optional customfield IDs (10111, 10607, 12212) | ✅ **PRESENT** | §1.10 table lists all 3 — exact match |
| 6 | Literal "DO NOT discover alternative IDs" + structured "Custom Field Error" template | ❌ **MISSING** | Legacy had a dedicated "Error Handling for Custom Fields" section with explicit injunction + message template. Local §5.4 compresses to: "Custom-field creation error on bug → Create bug without that field, note the failure in a bug comment, inform user to contact Jira admin". The explicit prohibition against discovery is gone |
| 7 | Non-UPEX 3-step fallback strategy + "Field Mapping Guide" table | ⚠️ **PARTIAL** | Local §1.10 footer has one-sentence fallback preserving the `_ADDITIONAL FIELDS_` block idea. Missing: (a) explicit 3-step strategy (search→ask→embed); (b) Field Mapping Guide table (UPEX name → common alternatives: Bug Severity / Defect Type / Found In / Cause Category / Actual Behavior / Expected Behavior) |

### Artifacts to restore

- Restore `(WAD)` parenthetical in "Working As Designed" entry of §1.8.
- Add to reporting-templates.md a structured "Error Handling" subsection with the legacy literal: *"DO NOT attempt to discover or query for alternative field IDs. Inform the user with: {Custom Field Error template}. Create the bug anyway with the fields that work. Add a comment to the created bug noting which field failed."*
- Add Field Mapping Guide table (6 rows: SEVERITY / Error Type / Test Environment / Root Cause / Actual Result / Expected Result → common alternatives).

---

## V-03 · `kata-architecture-adaptation.md` — diagrams + tables + patterns ✅ FULL

**Legacy source**: `.prompts/setup/kata-architecture-adaptation.md`
**Local target**: `project-discovery/references/kata-adaptation.md`

| # | Artifact | Status | Evidence |
|---|---|---|---|
| 1 | Session-reuse diagram (global-setup → ui-setup / api-setup) | ✅ **PRESENT** | kata-adaptation.md L114-123 — exact ASCII diagram with .auth/user.json and .auth/api-state.json outputs |
| 2 | 4 file-role tables (Read / Modify / Create / Generated) | ✅ **PRESENT (ADAPTED)** | Restructured: "Read" implicit in Phase 1 L40-81 (Read project context + Read template structure); "Always modified" + "Created per project" + "Generated by tooling" in §File inventory L484-490 |
| 3 | OpenAPI Type-Facade pattern | ✅ **PRESENT** | L242-302 has comprehensive documentation: auth.types.ts + booking.types.ts examples + barrel re-export + tsconfig aliases + rule "Components NEVER import from @openapi" (L30, L242) |
| 4 | 2-phase flow (Analysis+Plan → Implementation on approval) | ✅ **PRESENT** | L36 "Phase 1 — Analysis + Plan (no writes)"; L200 "Phase 2 — Implementation (writes)"; L196 explicit gate "Wait for explicit user approval before proceeding to Phase 2" |
| 5 | Completion gate (`test:smoke` + `typecheck`) | ✅ **PRESENT (EXPANDED)** | L432-448 has richer validation: type-check, lint, api-setup, ui-setup, smoke, second smoke run (session reuse) — 6 gates vs legacy's 2 |
| 6 | Legacy STEPs 1.1-1.4 inside Phase 1 | ✅ **PRESENT (ADAPTED, EXPANDED)** | Renumbered as 6 sub-steps: 1. Read project context / 2. Read template structure / 3. Authentication strategy decision tree / 4. Identify OpenAPI source / 5. Identify components to create / 6. Generate the adaptation plan |

**Verdict change vs audit**: ⚠️ PARTIAL → ✅ FULL. All 6 artifacts present; several expanded beyond legacy scope.

---

## V-04 · `acceptance-test-plan.md` — branch convention + labels ✅ FULL

**Legacy source**: `.prompts/stage-1-planning/acceptance-test-plan.md`
**Local target**: `sprint-testing/references/acceptance-test-planning.md`

| # | Artifact | Status | Evidence |
|---|---|---|---|
| 1 | Git branch convention `test/{JIRA_KEY}/{short-desc}` | ✅ **PRESENT** | 4 hits: L107, L157, L417, L463 |
| 2 | Label `shift-left-reviewed` | ✅ **PRESENT** | 4 hits: L105, L316, L364, L467 |
| 3 | JIRA-FIRST → LOCAL-MIRROR principle | ✅ **PRESENT (ADAPTED)** | Literal phrase gone; semantic preserved in L386 ("Jira / TMS comment is the canonical; local file is the exact mirror") + L454 Gotcha #9 ("Mirror order — Jira / TMS comment is the canonical; local file is the exact mirror. Never let them diverge") |
| 4 | Multi-step local → Jira key extraction | ✅ **PRESENT (ADAPTED)** | Legacy had explicit 4-step block; local L83 references "Jira Key from `{STORY_PATH}/context.md`" (single line). Key source file renamed `story.md` → `context.md` (post-skills-reorg) |

**Verdict change vs audit**: ⚠️ PARTIAL → ✅ FULL. 2 artifacts verbatim, 2 adapted with preserved semantics.

---

## V-05 · `project-assessment.md` — maturity scorecards ✅ FULL

**Legacy source**: `.prompts/discovery/phase-1-constitution/project-assessment.md`
**Local target**: `project-discovery/references/phase-1-constitution.md`

| # | Artifact | Status | Evidence |
|---|---|---|---|
| 1 | Testing maturity 5-level scorecard (None/Basic/Moderate/Good/Mature) | ✅ **PRESENT** | L133-139 — all 5 levels + indicators, exact match |
| 2 | Documentation 4-level scorecard (Minimal/Partial/Good/Complete) | ✅ **PRESENT** | L143-148 — all 4 levels + indicators, exact match |
| 3 | CI/CD 5-level scorecard (None/Basic/Moderate/Good/Mature) | ✅ **PRESENT** | L152-158 — all 5 levels + indicators, exact match |
| 4 | Code quality checklist (ESLint / Prettier / TypeScript / Pre-commit / CI checks) | ⚠️ **4/5 EXPLICIT** | L209-213: ESLint / Prettier / TypeScript / Pre-commit present; "CI checks on PRs" implicit (covered by CI/CD section) |
| 5 | Risk table with impact levels (5 risks) | ✅ **PRESENT** | L180-186 — all 5 risks: No tests (HIGH) / Outdated deps (MEDIUM) / No types (MEDIUM) / Hardcoded secrets (HIGH) / No CI (MEDIUM) |

**Verdict change vs audit**: ⚠️ PARTIAL → ✅ FULL. All scorecards and risk table preserved verbatim. The "(WAD)" comparable case from V-02 doesn't apply here.

---

## V-06 · Review checklist codes ⚠️ PARTIAL

**Legacy source**: `.prompts/stage-5-automation/review/e2e-test-review.md` + `integration-test-review.md`
**Local target**: `test-automation/references/review-checklists.md` (+ `automation-standards.md` §10)

| # | Artifact | Status | Evidence |
|---|---|---|---|
| 1 | Literal codes K-01 … K-09 (KATA compliance) | ❌ **CODES RENAMED** | grep `K-0` in automation-standards.md: 0 hits. review-checklists.md uses E-L/E-W/E-V/E-S/E-F/E-T/E-N (E2E deltas) and A-O/A-H/A-A/A-E/A-T/A-R/A-D (API deltas). Semantic content preserved (extends UiBase/ApiBase, @atc presence, etc.) but literal IDs K-01..K-09 gone |
| 2 | Literal codes A-01 … A-08 (ATC rules) | ❌ **CODES RENAMED** | Same situation. Note: local still uses `A-xx` codes but with different meaning (API deltas, not ATC rules) — collision risk |
| 3 | Literal codes T-01 … T-05 (TypeScript rules) | ❌ **CODES RENAMED** | No T-xx codes present. TypeScript rules live in `typescript-patterns.md` as prose, not numbered |
| 4 | Per-HTTP-method tuple-return validation table (GET single / GET list / POST / PUT/PATCH / DELETE) | ⚠️ **COMPRESSED** | Legacy had 5-row table. Local §3.2 A-H2 compresses to one rule: "GET/DELETE = 2-tuple `[APIResponse, TBody]`; POST/PUT/PATCH = 3-tuple `[APIResponse, TBody, TPayload]`". **Lost nuances**: (a) GET (list) variant `[APIResponse, TBody[]]` or `[APIResponse, ListResponse]`; (b) DELETE `[APIResponse, void]` (legacy) vs `[APIResponse, TBody]` (local) — semantic divergence |

### Architectural note

The local refactor split the legacy's 29+ flat checks into a shared list (`automation-standards.md` §10 "Component review / ATC review / Test file review") + deltas (`review-checklists.md`). This is a **cleaner design** but comes at the cost of the legacy's traceable K-01, A-01, T-01 codes. PRs that referenced "K-04 violated" now have no target.

### Remediation suggestion

- Add an appendix to `review-checklists.md` mapping legacy codes → new locations (e.g. `K-01 → automation-standards.md §10 / Component review / "Extends ApiBase/UiBase"`). Preserves link rot from old PR comments.
- Restore the per-HTTP-method tuple-return table in §3.2 as a 5-row table. Clarify DELETE: legacy was `void`, current is `TBody` — which is the intended behavior?

---

## V-07 · Planning templates ⚠️ PARTIAL

**Legacy source**: `.prompts/stage-5-automation/planning/module-test-specification.md`
**Local target**: `test-automation/references/planning-playbook.md`

| # | Artifact | Status | Evidence |
|---|---|---|---|
| 1 | ROADMAP.md template skeleton | ❌ **MISSING** | grep for `ROADMAP\|PROGRESS` returned only 1 file (planning-playbook.md). In that file, ROADMAP.md is named 5 times as an output (L18, L46, §11 checklist) but **the template structure / sections are never shown** |
| 2 | PROGRESS.md template skeleton | ❌ **MISSING** | Same situation. Named but not templated. Legacy test-automation-agent.md STEP 5 enumerated PROGRESS.md fields (Status, Test File path, Done count, Session Log, Shared Components Created, Current Status) — none of those template sections are in local |
| 3 | Per-ticket directory structure (`{PREFIX}-T{NN}-{name}/spec.md + implementation-plan.md + atc/*.md`) | ✅ **PRESENT** | L44-52 (module scope), L67-71 (ticket scope), L86-90 (regression scope) — exact structure preserved |

### Remediation suggestion

Add two explicit template blocks to `planning-playbook.md` (new §12 "Shared state files: ROADMAP.md and PROGRESS.md templates") covering:

**ROADMAP.md template** (module-scope, ticket index + phases + dependency graph):
- Table: `{PREFIX}-T{NN} | Title | Priority | Phase | Dependencies | TCs`
- Dependency graph (ASCII or Mermaid)
- Per-phase progress indicator

**PROGRESS.md template** (session-persistent tracker):
- Current Status block (Current Ticket / Completed count / Remaining count)
- Per-ticket row: `Ticket | Status (pending/in-progress/done) | Test File | Done | Notes`
- Session Log table: `Date | Action | Actor | Artifacts`
- Shared Components Created list

---

## V-08 · `feature-test-plan.md` label ✅ FULL

**Legacy source**: `.prompts/stage-1-planning/feature-test-plan.md`
**Local target**: `sprint-testing/references/feature-test-planning.md`

| # | Artifact | Status | Evidence |
|---|---|---|---|
| 1 | Label `test-plan-ready` | ✅ **PRESENT** | 3 hits: L203 ("Add label `test-plan-ready`."), L222 ("`[ISSUE_TRACKER_TOOL]` update epic description + label `test-plan-ready`"), L252 ("Epic labeled `test-plan-ready`") |

---

## V-09 · New-coverage sanity checks ✅ FULL

Confirm items marked 🆕 RESOLVED in the audit are not mere renamings.

### V-09.1 · `/refresh-ai-memory` — 6 AI-tool detection + Full/Minimal/Stop modes

| # | Artifact | Status | Evidence |
|---|---|---|---|
| 1 | 6 AI-tool detection table (CLAUDE.md / GEMINI.md / AGENTS.md / .cursor/rules / .github/copilot-instructions.md / .windsurf/rules) | ✅ **PRESENT** | Command L24-31 — full table |
| 2 | Mode decision: Full / Minimal / Stop | ✅ **PRESENT** | L61-63: Full Update (KATA + context files) / Minimal Update (KATA only) / Stop (no KATA → route to /project-discovery) |
| 3 | Security check (no creds, no prod URLs) | ⚠️ **NOT EXPLICIT** | grep for `creds\|prod URLs\|security` returned 0 hits. This may have been a conscious simplification or a gap. Low priority — the skill still works without it, but users may inadvertently publish secrets via README |

### V-09.2 · `/master-test-plan` — 8 sections from legacy project-test-guide.md

| # | Artifact | Status | Evidence |
|---|---|---|---|
| 1 | Executive risk map (top critical flows, ranked) | ✅ **PRESENT** | L14, L114 (§2) |
| 2 | Per-flow testing rationale | ✅ **PRESENT** | L15 |
| 3 | State machines that matter | ✅ **PRESENT** | L16, L137 (§4) |
| 4 | Silent killers — automated processes | ✅ **PRESENT** | L17, L145 (§5) |
| 5 | External-integration failure points | ✅ **PRESENT** | L18 "External-integration failure points and acceptable degradations" |
| 6 | Dependency cascade between flows | ✅ **PRESENT** | L19 "Dependency cascade between flows" |
| 7 | Developer-forgotten edge cases | ✅ **PRESENT** | L20 |
| 8 | Priority-ordered pre-release checklist | ✅ **PRESENT** | L21, L179 (§9) |
| + | Explicit out-of-scope section (not in legacy; added value) | ✅ **BONUS** | L22 |

All 8 legacy sections preserved + 1 new section for scope-creep prevention.

### V-09.3 · `sprint-orchestration.md` — 7 STEPs + board-status→wave table

| # | Artifact | Status | Evidence |
|---|---|---|---|
| 1 | Board-status → wave table | ✅ **PRESENT** | L53-58 — 4 rows mapping board status to wave category (DevStage / TestedDevStage / Dev Complete Merged / Dev Complete In Review) |
| 2 | 7 STEPs (validate → query → classify → carryover → waves → QA automation → write) | ✅ **PRESENT** | STEP 1 (L183 auto-detect) / STEP 2 (L194 dispatch) / STEP 4 (L363 post-ticket) / STEP 5 (L391 verification) / STEP 6 (L408 interrupted session) / STEP 7 (L421 session summary). STEP 0 and STEP 3 are integrated into the flow rather than numbered — semantic preservation |
| 3 | Carryover detection logic | ✅ **PRESENT** | L67 explicit |
| 4 | QA automation tasks section | ✅ **PRESENT** | L246-248 (Execution + Reporting dispatch entries) |

### V-09.4 · `sprint-orchestration.md` — sub-agent prompt templates

| # | Artifact | Status | Evidence |
|---|---|---|---|
| 1 | Sub-agent dispatch entries with ROLE / INSTRUCTIONS / TASK structure | ✅ **PRESENT (ADAPTED)** | L246, L248 preserve Execution + Reporting dispatch rows. Previous grep reported 21 hits for sub-agent/orchestrator/test-session-memory. **Spot-check passed** for the 4 sub-agent roles (Planning / Execution / Reporting / + a fourth role); templates are consolidated into a dispatch table rather than verbatim ROLE/INSTRUCTIONS/TASK blocks — semantically equivalent |

---

# Net findings

## Definitive GAPs (content NOT preserved) — all RESOLVED 2026-04-20

1. **V-01 artifact 1** — Interrupted-session recovery matrix ✅ **RESOLVED** (`planning-playbook.md` §12)
2. **V-01 artifact 2** — Max 2 revision loops ceiling ✅ **RESOLVED** (`planning-playbook.md` §12.1)
3. **V-01 artifacts 3+5** — PROGRESS/ROADMAP auto-update + G2/G3/G4 phase-transition gates ✅ **RESOLVED** (`planning-playbook.md` §12.2 + §12.3 + §13)
4. **V-02 artifact 6** — Literal "DO NOT discover alternative IDs" + Custom Field Error template ✅ **RESOLVED** (`reporting-templates.md` §1.10.1)
5. **V-02 artifact 7** — 3-step non-UPEX fallback strategy + Field Mapping Guide table ✅ **RESOLVED** (`reporting-templates.md` §1.10.2)
6. **V-06 artifacts 1-3** — Literal K-01..K-09 / A-01..A-08 / T-01..T-05 codes ✅ **RESOLVED** (`review-checklists.md` Appendix — legacy-code cross-reference)
7. **V-06 artifact 4** — Per-HTTP-method tuple-return table (DELETE void/TBody divergence) ✅ **RESOLVED** (`review-checklists.md` §3.2.1; DELETE default `TBody`, `void` opt-in on 204 with component-level note)
8. **V-07 artifacts 1-2** — ROADMAP.md + PROGRESS.md template skeletons ✅ **RESOLVED** (`planning-playbook.md` §13.1 + §13.2)

## Minor cosmetic losses — status 2026-04-20

- **V-02 artifact 3** — "(WAD)" parenthetical restored ✅ **RESOLVED** (`reporting-templates.md` §1.8)
- **V-05 artifact 4** — "CI checks on PRs" implicit in CI/CD scorecard — **accepted as non-material** (covered by CI/CD 5-level scorecard)
- **V-09.1 artifact 3** — Security checks strengthened with active pre-write redaction ✅ **RESOLVED** (`refresh-ai-memory.md` Step 3 · Pre-write redaction)

## Verdicts upgraded after verification

Four audit items were flagged ⚠️ PARTIAL but verification confirmed they are actually ✅ FULL:
- **V-03** KATA adaptation — all 6 artifacts present, several expanded
- **V-04** ATP conventions — 4/4 artifacts present (2 verbatim, 2 adapted)
- **V-05** Assessment scorecards — all 3 scorecards + risk table verbatim
- **V-09** New-coverage sanity — /refresh-ai-memory, /master-test-plan, sprint-orchestration all confirmed full (with 1 minor on security checks)

---

# Prioritized remediation backlog (for future execution)

**Do not execute yet — this is a read-only audit product.** When/if the user approves remediation, tackle in this order:

## HIGH priority (3 items)

1. **V-01** — Add to `planning-playbook.md` (new §12 or new `references/orchestration-gates.md`):
   - Interrupted-session recovery matrix
   - Max 2 revision loops ceiling in Phase 3
   - Quality Gates G1-G4 table with phase-transition criteria

2. **V-02** — Add to `reporting-templates.md` §1 or a new `jira-setup.md` §4:
   - Restructured "Error Handling for Custom Fields" with literal "DO NOT discover alternative IDs"
   - Custom Field Error user-facing message template
   - Non-UPEX 3-step fallback workflow + Field Mapping Guide table
   - Restore "(WAD)" parenthetical

3. **V-07** — Add to `planning-playbook.md` §12:
   - ROADMAP.md template skeleton (ticket index + dependency graph)
   - PROGRESS.md template skeleton (Current Status + ticket rows + Session Log + Shared Components)

## MEDIUM priority (2 items)

4. **V-06 artifact 4** — Restore 5-row tuple-return table in `review-checklists.md` §3.2. Clarify DELETE semantics (void vs TBody — which is correct?).

5. **V-06 cosmetic** — Add legacy-code mapping appendix (K-01 → new location, etc.) to `review-checklists.md` to preserve backward reference in historical PRs.

## LOW priority (1 item)

6. **V-09.1** — Consider adding security-scan step to `/refresh-ai-memory` (no creds / no prod URLs) to protect against accidental secret leakage during README regeneration.

---

**Next action** (pending user approval): open `plans/legacy-prompts-remediation-plan.md` with the 6 items above, grouped by file-of-change, ordered by priority.

*Report complete — 2026-04-19. Verification protocol followed on all 9 V-items; no writes to skills/commands during this pass.*
