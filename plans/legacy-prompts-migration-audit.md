# Legacy Prompts → Skills Migration Audit

> **Scope**: Compare the legacy boilerplate `upex-galaxy/ai-driven-test-automation-boilerplate` (`.prompts/**` static architecture) against the current skills-first architecture (`.claude/skills/` + `.claude/commands/`), reflecting the changes from `plans/skills-reorg-plan.md` (Session 1) and `plans/prompt-cleanup-plan.md` (Session 2).
>
> **Date**: 2026-04-19
> **Legacy repo**: https://github.com/upex-galaxy/ai-driven-test-automation-boilerplate (branch `main`)
> **Audit goal**: ensure no content of value has been lost in the migration, identify residual gaps, and produce a verification roadmap.

**Legend:** ✅ **FULL** · ⚠️ **PARTIAL** · ❌ **GAP** · 🆕 **NEW COVERAGE** (resolved by Session 1 + Session 2)

---

## 🟦 Root orchestrators

| Legacy file | Purpose (1-line) | → Skill target (updated) | Coverage | Notes |
|---|---|---|---|---|
| `README.md` | Top-level index + dependency diagram + "new project vs user story" decision tree | `CLAUDE.md` + `AGENTS.md` + `.context/README.md` (rewritten in Future C) | ✅ **FULL** 🆕 | Level 1 block rewritten, `.context/README.md` also. Dependency chain now reflects `business-data-map → business-feature-map → business-api-map → master-test-plan` |
| `session-start.md` | Per-ticket entry | `sprint-testing/references/session-entry-points.md` + `SKILL.md` | ✅ FULL | No changes |
| `bug-qa-workflow.md` | 3-phase retest + veto + risk score | `sprint-testing/SKILL.md` §Bug branch + `reporting-templates.md` | ✅ FULL | No changes |
| `us-qa-workflow.md` | 6-stage orchestrator | Distributed across 4 skills | ✅ FULL | No changes |
| `orchestrators/sprint-testing-agent.md` | Batch dispatcher + sub-agent templates + test-session-memory | `sprint-testing/references/sprint-orchestration.md` | ✅ **FULL** 🆕 | 21 hits confirm sub-agent templates + ORCHESTRATOR RULES preserved. Also auto-invocation step 0.5 (Immediate 2). Previously PARTIAL |
| `orchestrators/test-automation-agent.md` | Recovery matrix, max 2 revisions, PROGRESS/ROADMAP update, TMS post-step, Quality Gates G1-G4 | `test-automation/references/planning-playbook.md` | ⚠️ **PARTIAL** (persists) | `planning-playbook.md` edited in Session 1 but **0 hits for recovery / revision loops / Quality Gate / G1-G4 / interrupted**. With resume now simplified (reads PROGRESS.md + ROADMAP.md directly), SESSION-PROMPT.md is obsolete, but the **2-revision ceiling and G1-G4 gates remain undocumented** |

---

## 🟪 Utilities

| Legacy file | Purpose | → Current target | Coverage | Notes |
|---|---|---|---|---|
| `utilities/context-engineering-setup.md` | Generate README + AI memory file (6 AI-tools, security checks, Full/Minimal/Stop modes) | **`/refresh-ai-memory`** command (Immediate 1 + re-tune Future D) | ✅ **FULL** 🆕 | **Critical GAP #1 RESOLVED**. Step 0 detects 6 AI-tools (CLAUDE/GEMINI/AGENTS/.cursor/.github copilot/.windsurf); live quartet + `api/schemas/` added |
| `utilities/project-test-guide.md` | Senior-QA conversational voice, 8 sections, pre-release checklist | **`/master-test-plan`** command (Future A) | ✅ **FULL** 🆕 | **Previously PARTIAL**. New dedicated command: executive risk map, per-flow rationale, state machines, silent killers, integrations, edge cases, priority-ordered pre-release checklist, out-of-scope. Output: `.context/master-test-plan.md` |
| `utilities/sprint-test-framework-generator.md` | `SPRINT-{N}-TESTING.md` from backlog + status→wave table | `sprint-testing/references/sprint-orchestration.md` (Part 1 renamed + auto-invocation step 0.5) | ✅ **FULL** 🆕 | **Previously PARTIAL**. Integrated as Part 1 of the skill + auto-invocation |
| `utilities/git-flow.md` | Git flow | `/git-flow` command | ✅ FULL | No changes |
| `utilities/git-conflict-fix.md` | Resolve git conflicts | `/git-conflict-fix` command | ✅ FULL | No changes |
| `utilities/traceability-fix.md` | Repair US-ATP-ATR-TC links | `/traceability-fix` command | ✅ FULL | No changes |
| `utilities/test-execution-breakdown.md` | Execution breakdown | `/test-execution-breakdown` command | ✅ FULL | No changes |

---

## 🟩 Discovery

| Legacy file | Purpose | → Skill target | Coverage | Notes |
|---|---|---|---|---|
| `phase-1-constitution/project-connection.md` | Connect repos, stack detection, env URLs | `project-discovery/references/phase-1-constitution.md` | ✅ FULL | No changes |
| `phase-1-constitution/project-assessment.md` | Maturity scorecards (5 levels) + risk table | `project-discovery/references/phase-1-constitution.md` | ⚠️ PARTIAL (persists) | Still requires verifying 5-level scorecard depth (None/Basic/Moderate/Good/Mature) |
| `phase-1-constitution/business-model-discovery.md` | BMC discovery | `phase-1-constitution.md` | ✅ FULL | No changes |
| `phase-1-constitution/domain-glossary.md` | Entity/enum/relationship extraction | `phase-1-constitution.md` | ✅ FULL | No changes |
| `phase-2-architecture/prd-executive-summary.md` | Exec summary | `phase-2-prd.md` | ✅ FULL | No changes |
| `phase-2-architecture/prd-user-personas.md` | Personas | `phase-2-prd.md` | ✅ FULL | No changes |
| `phase-2-architecture/prd-user-journeys.md` | User journeys | `phase-2-prd.md` | ✅ FULL | No changes |
| `phase-2-architecture/prd-feature-inventory.md` | Feature inventory from API/UI/flags | **`/business-feature-map`** command (Immediate 4) | ✅ **FULL** 🆕 | §4 of `phase-2-prd.md` now delegates to the dedicated command. Output in `.context/mapping/business-feature-map.md` |
| `phase-2-architecture/srs-*.md` (4 files) | Architecture + API contracts + func + non-func | `phase-2-srs.md` | ✅ FULL | No changes |
| `phase-3-infrastructure/backend-discovery.md` | Backend | `phase-3-infrastructure.md` | ✅ FULL | — |
| `phase-3-infrastructure/frontend-discovery.md` | Frontend | `phase-3-infrastructure.md` | ✅ FULL | — |
| `phase-3-infrastructure/infrastructure-mapping.md` | Infra mapping | `phase-3-infrastructure.md` | ✅ FULL | — |
| `phase-4-specification/pbi-backlog-mapping.md` | Backlog→PBI | `phase-4-specification.md` | ✅ FULL | — |
| `phase-4-specification/pbi-story-template.md` | Story template | `phase-4-specification.md` | ✅ FULL | — |
| `discovery/api-architecture.md` | API catalog with stack detection | **`/business-api-map`** (business) + `bun run api:sync` (technical) (Immediate 3 + Future B) | ✅ **FULL** 🆕 (split) | Architecture split: business angle → dedicated command at `.context/mapping/business-api-map.md`; technical types → `api/schemas/` via script. Generator 2 in `context-generators.md` became concise block |
| `discovery/business-data-map.md` | Entities + flows + state machines + integrations | `/business-data-map` command + `.context/mapping/business-data-map.md` (Follow-up E) | ✅ FULL (path updated) | File moved from `.context/` to `.context/mapping/`. ~30 path replacements across 17 files |

---

## 🟧 Setup

| Legacy file | Purpose | → Skill target | Coverage | Notes |
|---|---|---|---|---|
| `setup/kata-architecture-adaptation.md` | 2-phase KATA adaptation, session-reuse diagram, 4 Files R/M/C/G tables, OpenAPI Type-Facade | `project-discovery/references/kata-adaptation.md` | ⚠️ PARTIAL (persists) | Session 1 touched `kata-adaptation.md` but session-reuse diagram + 4 tables + Type-Facade pattern audit pending |

---

## 🟫 Stage 1 — Planning

| Legacy file | Purpose | → Skill target | Coverage | Notes |
|---|---|---|---|---|
| `stage-1-planning/acceptance-test-plan.md` | ATP, branch `test/{KEY}/{slug}`, label `shift-left-reviewed` | `acceptance-test-planning.md` + `test-documentation/SKILL.md` §Phase 3 | ⚠️ PARTIAL (persists) | Session 1 edited `acceptance-test-planning.md`. Literal branch convention + label verification pending |
| `stage-1-planning/feature-test-plan.md` | Feature test plan per epic | `feature-test-planning.md` | ✅ FULL | Session 1 touched it; confirm `test-plan-ready` label |

---

## 🟥 Stage 2 — Execution

| Legacy file | Purpose | → Skill target | Coverage |
|---|---|---|---|
| `smoke-test.md` | Go/No-Go 5-10 min | `exploration-patterns.md` §Smoke + Gotcha #4 | ✅ FULL |
| `ui-exploration.md` | UI exploratory, 3 input modes | `exploration-patterns.md` §UI | ✅ FULL |
| `api-exploration.md` | API exploratory | `exploration-patterns.md` §API | ✅ FULL |
| `db-exploration.md` | DB: constraints/triggers/RLS/migrations | `exploration-patterns.md` §DB | ✅ FULL |

---

## 🟨 Stage 3 — Reporting

| Legacy file | Purpose | → Skill target | Coverage | Notes |
|---|---|---|---|---|
| `bug-report.md` | UPEX custom-fields schema, literal fallback | `reporting-templates.md` + `jira-setup.md` | ⚠️ PARTIAL (persists) | Verbatim spot-check still pending: 8 Error Type + 5 SEVERITY + 8 Root Cause strings + "DO NOT discover alternative IDs" message + non-UPEX fallback path |
| `test-report.md` | ATR + TC pass-rate table | `reporting-templates.md` | ✅ FULL | No changes |

---

## 🟦 Stage 4 — Documentation

| Legacy file | Purpose | → Skill target | Coverage |
|---|---|---|---|
| `test-analysis.md` | Jira context, regression candidates, nomenclature | `test-documentation/SKILL.md` §Phase 1 | ✅ FULL |
| `test-prioritization.md` | ROI + 3 Phase-0 + 1-5 factors + Candidate/Manual/Deferred | `test-documentation/SKILL.md` §Phase 2 | ✅ FULL |
| `test-documentation.md` | 2×2 modality + workflow + TC syntax | `test-documentation/SKILL.md` §Phase 3 + 4 references | ✅ FULL |

---

## 🟩 Stage 5 — Automation

| Legacy file | Purpose | → Skill target | Coverage | Notes |
|---|---|---|---|---|
| `planning/module-test-specification.md` | Macro — whole module → test-specs/ | `planning-playbook.md` §module | ✅ FULL | Confirm ROADMAP + PROGRESS templates |
| `planning/test-specification.md` | Medium — ticket/bug/gap → spec.md | `planning-playbook.md` §ticket | ✅ FULL | — |
| `planning/atc-implementation-plan.md` | Micro — 1 ATC | `planning-playbook.md` §ATC | ✅ FULL | — |
| `planning/test-implementation-plan.md` | Impl plan: ATCs, test-data, fixture | `test-automation/SKILL.md` §Phase 1 + playbook + `test-data-management.md` | ✅ FULL | — |
| `coding/e2e-test-coding.md` | UI KATA impl | `test-automation/SKILL.md` §Phase 2 + `e2e-patterns.md` | ✅ FULL | — |
| `coding/integration-test-coding.md` | API impl tuple returns | `test-automation/SKILL.md` §Phase 2 + `api-patterns.md` | ✅ FULL | — |
| `review/e2e-test-review.md` | Kxx / Axx / Txx checklists | `review-checklists.md` | ✅ FULL | Literal codes pending verification |
| `review/integration-test-review.md` | Tuple-return table per HTTP method | `review-checklists.md` | ✅ FULL | Per-HTTP-method table pending verification |
| **`SESSION-PROMPT.md` templates** (legacy session-resume) | @-loadable session-resume file | **Removed (Task 1 Session 2)**: `/test-automation` reads PROGRESS.md + ROADMAP.md directly | ✅ **FULL** 🆕 | Resume functionality simplified: no more `@`-loadable file; the skill reads PBI state directly |

---

## 🟥 Stage 6 — Regression

| Legacy file | Purpose | → Skill target | Coverage |
|---|---|---|---|
| `regression-execution.md` | Trigger gh workflow + RUN_ID + monitor | `regression-testing/SKILL.md` §Phase 1 | ✅ FULL |
| `regression-analysis.md` | Parse + classify failures + severity | `regression-testing/SKILL.md` §Phase 2 + `failure-classification.md` | ✅ FULL |
| `regression-report.md` | GO/CAUTION/NO-GO + weighted matrix + template | `regression-testing/SKILL.md` §Phase 3 | ✅ FULL |

---

# 🚨 Top risks / gaps — updated status

| # | Original item | Before | Now | Comment |
|---|---|---|---|---|
| **1** | `context-engineering-setup.md` with no owner | ❌ GAP | ✅ **RESOLVED** 🆕 | New `/refresh-ai-memory` with 6 AI-tools detection, security, modes |
| **2** | `test-automation-agent` — recovery matrix, max 2 revisions, G1-G4 | ⚠️ PARTIAL | ⚠️ **PERSISTS** | `planning-playbook.md` edited but grep returns 0 hits for recovery / revision loops / Quality Gate / G1-G4 / interrupted |
| **3** | `sprint-testing-agent` — sub-agent templates + ORCHESTRATOR RULES | ⚠️ PARTIAL | ✅ **RESOLVED** 🆕 | 21 hits confirm templates + rules + auto-invocation step 0.5 |
| **4** | `sprint-test-framework-generator` — status→wave + 7 STEPs | ⚠️ PARTIAL | ✅ **RESOLVED** 🆕 | Integrated as Part 1 of `sprint-orchestration.md` with auto-invocation |
| **5** | `project-test-guide` — conversational voice + 8 sections + pre-release | ⚠️ PARTIAL | ✅ **RESOLVED** 🆕 | New `/master-test-plan` dedicated command (~170 lines), coverage includes ranked strategy, silent killers, cascade deps |
| **6** | `kata-architecture-adaptation` — session-reuse diagram + 4 tables + Type-Facade | ⚠️ PARTIAL | ⚠️ **PERSISTS (verify)** | `kata-adaptation.md` edited but spot-check of diagram + tables pending |
| **7** | `acceptance-test-plan` — branch `test/{KEY}/{slug}` + `shift-left-reviewed` | ⚠️ PARTIAL | ⚠️ **PERSISTS (verify)** | `acceptance-test-planning.md` edited; literal convention confirmation pending |
| **8** | `bug-report` — UPEX custom-fields (8 Error Type + 5 SEV + 8 Root Cause + literal fallback) | ⚠️ PARTIAL | ⚠️ **PERSISTS** | No changes across the two sessions; verbatim spot-check pending |
| **9** | `README` — dependency chain + decision tree | ⚠️ PARTIAL | ✅ **PARTIAL→RESOLVED** 🆕 | Root CLAUDE.md + AGENTS.md + `.context/README.md` rewritten. Dependency chain implicit: `business-data-map → feature-map → api-map → master-test-plan` |
| **10** | `project-assessment` — 5-level scorecards + risk table | ⚠️ PARTIAL | ⚠️ **PERSISTS (verify)** | No changes; verify depth in `phase-1-constitution.md` |

---

# 📊 Executive summary

| Metric | Before Session 1+2 | After Session 1+2 | After V-01..V-09 verification | After remediation (2026-04-20) |
|---|---|---|---|---|
| Total legacy prompts | 61 | 61 | 61 | 61 |
| ✅ FULL | 47 (77%) | 53 (87%) | 57 (93%) | **61 (100%)** |
| ⚠️ PARTIAL | 13 (21%) | 7 (11%) | 4 (7%) | **0 (0%)** |
| ❌ GAP | 1 (2%) | 0 (0%) | 0 (0%) | **0 (0%)** |

> **Remediation completed 2026-04-20** — 7 edits across 4 files closed the 6 concrete gaps from V-01, V-02, V-06, V-07. See `plans/legacy-prompts-remediation-plan.md` for the edit-by-edit log and `plans/legacy-prompts-verification-report.md` for the original evidence. All four PARTIAL V-items are now FULL.

**New commands** (`.claude/commands/`): `refresh-ai-memory`, `master-test-plan`, `business-api-map` (total: 9 commands today vs. 6 before).
**New folder**: `.context/mapping/` with the 3 business maps centralized.
**Unified terminology**: "system prompt" → "AI memory file" (5 locations).
**Simplified session resume**: no `@-loadable` files; direct read of `PROGRESS.md + ROADMAP.md`.

---

# 🧭 Verification Roadmap (re-audit)

> Each item below is a verification-only task — **no writes yet**. The goal is to confirm with evidence whether each PARTIAL is actually preserved in the referenced skill/reference. Only after full verification will a remediation plan be drafted (separate doc).

## Verification protocol (applies to every item)

1. **Read the target local file** end-to-end (or the relevant section).
2. **Fetch the legacy prompt** via `gh api repos/upex-galaxy/ai-driven-test-automation-boilerplate/contents/<path>?ref=main --jq '.content' | base64 -d`.
3. **Extract the load-bearing artifacts** listed for each task (tables, checklists, literal strings, diagrams, code blocks).
4. **Confirm presence verbatim or with equivalent semantics** in the current skill. Mark each artifact as `PRESENT / ADAPTED / MISSING`.
5. **Record findings** in a per-item subsection of a new `plans/legacy-prompts-verification-report.md` (to be created after the roadmap executes).
6. **Do not patch** anything during verification. Remediation is a separate phase.

---

## 🟥 PRIORITY 1 — HIGH RISK

### V-01 · `test-automation-agent.md` — recovery matrix + review gates

**✅ VERIFIED 2026-04-19 — Verdict: ⚠️ PARTIAL · Remediation: HIGH priority**

- **Legacy path**: `.prompts/orchestrators/test-automation-agent.md`
- **Local target**: `.claude/skills/test-automation/references/planning-playbook.md` (+ SKILL.md)
- **Current signal**: grep returns **0 hits** for `recovery | revision loops | Quality Gate | G1 | G2 | G3 | G4 | interrupted` in `planning-playbook.md`.
- **Load-bearing artifacts**:
  - [x] Interrupted-session recovery matrix — ❌ **MISSING**
  - [x] Ceiling of **max 2 revision loops** in Phase 3 (Review) — ❌ **MISSING**
  - [x] Auto-update of `PROGRESS.md` and `ROADMAP.md` after each Phase — ⚠️ **PARTIAL** (named but no post-phase protocol)
  - [x] Post-step "TMS: Update Test Status → Automated" — ✅ **PRESENT (ADAPTED)** (playbook L264, L273)
  - [x] **Quality Gates G1-G4** between phases — ⚠️ **PARTIAL** (only G1 preserved as §10 "Approval gate")
- **Full evidence**: verification-report.md §V-01.

---

### V-02 · `bug-report.md` — UPEX custom-fields verbatim

**✅ VERIFIED 2026-04-19 — Verdict: ⚠️ PARTIAL · Remediation: MEDIUM priority**

- **Legacy path**: `.prompts/stage-3-reporting/bug-report.md`
- **Local target**: `sprint-testing/references/reporting-templates.md` + `test-documentation/references/jira-setup.md`
- **Load-bearing artifacts**:
  - [x] 8 Error Type dropdown strings — ✅ **PRESENT** (reporting-templates.md §1.6)
  - [x] 5 SEVERITY dropdown strings — ✅ **PRESENT** (§1.4)
  - [x] 8 Root Cause dropdown strings — ⚠️ **7/8 VERBATIM** ("Working As Designed (WAD)" loses `(WAD)` parenthetical)
  - [x] 7 mandatory `customfield_*` IDs — ✅ **PRESENT** (§1.10 table)
  - [x] 3 optional `customfield_*` IDs — ✅ **PRESENT** (§1.10 table)
  - [x] Literal "DO NOT discover alternative IDs" + "Custom Field Error" template — ❌ **MISSING** (compressed to one-line in §5.4)
  - [x] Non-UPEX 3-step fallback + Field Mapping Guide table — ⚠️ **PARTIAL** (strategy compressed; mapping table missing)
- **Full evidence**: verification-report.md §V-02.

---

## 🟧 PRIORITY 2 — MEDIUM RISK

### V-03 · `kata-architecture-adaptation.md` — diagrams + tables + patterns

**✅ VERIFIED 2026-04-19 — Verdict: ✅ FULL · No remediation needed**

- **Legacy path**: `.prompts/setup/kata-architecture-adaptation.md`
- **Local target**: `project-discovery/references/kata-adaptation.md`
- **Load-bearing artifacts**:
  - [x] Session-reuse diagram — ✅ **PRESENT** (kata-adaptation.md L114-123, ASCII)
  - [x] 4 file-role tables — ✅ **PRESENT (ADAPTED)** (Read implicit in Phase 1 L40-81; Modify/Create/Generated in §File inventory L484-490)
  - [x] OpenAPI Type-Facade pattern — ✅ **PRESENT** (L242-302, full docs + examples + tsconfig aliases)
  - [x] 2-phase flow Analysis+Plan → Implementation — ✅ **PRESENT** (L36 Phase 1, L200 Phase 2, explicit approval gate L196)
  - [x] Completion gate — ✅ **PRESENT (EXPANDED)** (L432-448, 6 gates vs legacy's 2)
  - [x] Legacy STEPs 1.1-1.4 in Phase 1 — ✅ **PRESENT (ADAPTED, EXPANDED to 6 sub-steps)**
- **Full evidence**: verification-report.md §V-03. Several artifacts expanded beyond legacy scope.

---

### V-04 · `acceptance-test-plan.md` — branch convention + labels

**✅ VERIFIED 2026-04-19 — Verdict: ✅ FULL · No remediation needed**

- **Legacy path**: `.prompts/stage-1-planning/acceptance-test-plan.md`
- **Local target**: `sprint-testing/references/acceptance-test-planning.md`
- **Load-bearing artifacts**:
  - [x] Branch `test/{JIRA_KEY}/{short-desc}` — ✅ **PRESENT** (4 hits: L107/L157/L417/L463)
  - [x] Label `shift-left-reviewed` — ✅ **PRESENT** (4 hits: L105/L316/L364/L467)
  - [x] JIRA-FIRST → LOCAL-MIRROR principle — ✅ **PRESENT (ADAPTED)** (preserved as Gotcha #9 L454 "Mirror order")
  - [x] Multi-step local → Jira key extraction — ✅ **PRESENT (ADAPTED)** (compressed to one line L83; source renamed `story.md` → `context.md`)
- **Full evidence**: verification-report.md §V-04.

---

### V-05 · `project-assessment.md` — maturity scorecards

**✅ VERIFIED 2026-04-19 — Verdict: ✅ FULL · No remediation needed**

- **Legacy path**: `.prompts/discovery/phase-1-constitution/project-assessment.md`
- **Local target**: `project-discovery/references/phase-1-constitution.md`
- **Load-bearing artifacts**:
  - [x] Testing maturity 5-level scorecard — ✅ **PRESENT** (L133-139, exact match)
  - [x] Documentation 4-level scorecard — ✅ **PRESENT** (L143-148)
  - [x] CI/CD 5-level scorecard — ✅ **PRESENT** (L152-158)
  - [x] Code quality checklist (5 items) — ⚠️ **4/5 EXPLICIT** ("CI checks on PRs" implicit)
  - [x] Risk table with impact levels — ✅ **PRESENT** (L180-186, 5 risks verbatim)
- **Full evidence**: verification-report.md §V-05. Only cosmetic omission ("CI checks on PRs").

---

## 🟨 PRIORITY 3 — LOW RISK (quality-of-life confirmations)

### V-06 · `review/e2e-test-review.md` + `review/integration-test-review.md` — checklist codes

**✅ VERIFIED 2026-04-19 — Verdict: ⚠️ PARTIAL · Remediation: LOW priority (cosmetic)**

- **Legacy path**: `.prompts/stage-5-automation/review/*`
- **Local target**: `test-automation/references/review-checklists.md` (+ `automation-standards.md` §10)
- **Artifacts**:
  - [x] Literal codes **K-01 … K-09** (KATA compliance) — ❌ **CODES RENAMED** (content preserved as E-L/E-W/E-V/etc deltas + shared list in automation-standards.md §10)
  - [x] Literal codes **A-01 … A-08** (ATC rules) — ❌ **CODES RENAMED** (collision risk: local uses A-xx for API deltas)
  - [x] Literal codes **T-01 … T-05** (TypeScript rules) — ❌ **CODES MISSING** (lives as prose in typescript-patterns.md)
  - [x] Per-HTTP-method **tuple-return validation table** (GET/POST/PUT/PATCH/DELETE) — ⚠️ **COMPRESSED** to A-H2 one-liner; DELETE semantics divergence (legacy `void` vs local `TBody`)
- **Full evidence**: verification-report.md §V-06.

---

### V-07 · `stage-5-automation/planning/module-test-specification.md` — templates

**✅ VERIFIED 2026-04-19 — Verdict: ⚠️ PARTIAL · Remediation: MEDIUM priority**

- **Legacy path**: `.prompts/stage-5-automation/planning/module-test-specification.md`
- **Local target**: `test-automation/references/planning-playbook.md`
- **Artifacts**:
  - [x] `ROADMAP.md` template skeleton — ❌ **MISSING** (named 5× but structure never shown)
  - [x] `PROGRESS.md` template skeleton — ❌ **MISSING** (same — named, not templated)
  - [x] Per-ticket directory structure (`{PREFIX}-T{id}-{name}/spec.md + implementation-plan.md + atc/*.md`) — ✅ **PRESENT** (L44-52, L67-71, L86-90)
- **Full evidence**: verification-report.md §V-07.

---

### V-08 · `stage-1-planning/feature-test-plan.md` — label

**✅ VERIFIED 2026-04-19 — Verdict: ✅ FULL · No remediation needed**

- **Local target**: `sprint-testing/references/feature-test-planning.md`
- **Artifact**: label `test-plan-ready` — ✅ **PRESENT** (3 hits: L203, L222, L252).

---

## 🟩 PRIORITY 4 — VERIFY NEW COVERAGES DIDN'T REGRESS

### V-09 · Session 1+2 sanity checks

**✅ VERIFIED 2026-04-19 — Verdict: ✅ FULL (with 1 minor) · Remediation: LOW priority**

- **Purpose**: ensure the "resolved" items are actually resolved (not just renamed).
- **Checks**:
  - [x] `/refresh-ai-memory` — ✅ 6 AI-tool table (L24-31); Full/Minimal/Stop modes (L61-63). ⚠️ Security checks (no creds / no prod URLs) NOT EXPLICIT (minor gap).
  - [x] `/master-test-plan` — ✅ all 8 legacy sections + 1 bonus (out-of-scope). Executive risk map, per-flow rationale, state machines, silent killers, integrations, dependency cascade, edge cases, pre-release checklist.
  - [x] `sprint-orchestration.md` Part 1 — ✅ board-status→wave table (L53-58); 7 STEPs present (STEP 1/2/4/5/6/7; STEP 0+3 integrated); carryover detection (L67); QA automation tasks (L246-248).
  - [x] Sub-agent prompt templates — ✅ PRESENT (ADAPTED) — consolidated into dispatch table rather than verbatim ROLE/INSTRUCTIONS/TASK blocks; semantic preservation confirmed (21 grep hits earlier).
- **Full evidence**: verification-report.md §V-09.

---

## Execution order — STATUS: ✅ ALL COMPLETED (2026-04-19)

```
✅ V-01  (HIGH — test-automation-agent gate recovery)       → PARTIAL · 3 gaps
✅ V-02  (HIGH — UPEX bug-report verbatim)                  → PARTIAL · 2 gaps
✅ V-03  (MED  — KATA adaptation artifacts)                 → FULL
✅ V-04  (MED  — ATP branch/label)                          → FULL
✅ V-05  (MED  — maturity scorecards)                       → FULL
✅ V-09  (MED  — new-coverage sanity checks)                → FULL · 1 minor
✅ V-06  (LOW  — review checklists codes)                   → PARTIAL · architectural refactor
✅ V-07  (LOW  — planning templates)                        → PARTIAL · 2 gaps
✅ V-08  (LOW  — feature-test-plan label)                   → FULL
```

**Deliverable produced**: `plans/legacy-prompts-verification-report.md` — per-V-item artifact checklists filled with evidence (line references, verbatim quotes, diff notes).

**Next phase (pending user approval)**: `plans/legacy-prompts-remediation-plan.md` will propose concrete edits to close the remaining gaps from V-01, V-02, V-06, V-07 (6 items total, prioritized HIGH/MEDIUM/LOW).

---

## Out-of-scope for this audit

- Content deemed outdated by intentional design decisions in Session 1+2 (e.g., `SESSION-PROMPT.md` removal, api-architecture split into business/technical).
- Skills added with **no legacy equivalent** (`acli`, `playwright-cli`, `xray-cli`) — they are forward additions, not migration targets.
- Changes to `.context/mapping/` folder structure beyond confirming the 3 stubs exist (already verified).

---

*Last updated: 2026-04-19 — audit snapshot reflecting Session 1 (`skills-reorg-plan.md`) and Session 2 (`prompt-cleanup-plan.md`).*
