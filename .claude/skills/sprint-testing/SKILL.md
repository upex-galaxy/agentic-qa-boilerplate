---
name: sprint-testing
description: "Orchestrates in-sprint manual QA per ticket across Stages 1 (Planning), 2 (Execution) and 3 (Reporting). Use for user-story testing, bug retesting, and batch-sprint QA loops. Creates the PBI folder, drives session-start, runs the triage + veto + risk-score decision tree on bugs, produces the ATP + ATR + TC artifacts in the TMS, executes smoke and trifuerza (UI/API/DB) exploration, and files the final QA comment + bug reports. Triggers on: test this ticket, QA this user story, retest this bug, verify bug fix, run exploratory testing, smoke test a feature, process the sprint, next ticket in sprint, generate the SPRINT-N-TESTING framework, resume sprint testing, continue-from a ticket. Do NOT use for Stage 4 TMS documentation + ROI (test-documentation), Stage 5 automation coding (test-automation), Stage 6 regression suite execution (regression-testing), or onboarding a new repo (project-discovery)."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
---

# Sprint Testing — Plan, Execute, Report per Ticket

Drive the manual / exploratory QA loop for a single ticket during a sprint. Three stages, always in this order: **Stage 1 Planning -> Stage 2 Execution -> Stage 3 Reporting**. Hand off afterwards to the skills that own Stage 4, 5 and 6.

The same three-stage pipeline runs in every mode. Only the entry point and the bookkeeping differ: one ticket at a time (single-ticket), or N tickets managed by a framework file (batch-sprint).

---

## Subagent Dispatch Strategy

This skill is compliant with the doctrine in `AGENTS.md` §"Orchestration Mode (Subagent Strategy)". Every dispatch follows the 6-component briefing format defined in `.claude/skills/framework-core/references/briefing-template.md`, and the pattern selected per stage matches the decision guide in `.claude/skills/framework-core/references/dispatch-patterns.md`. This skill operates in two modes (single-ticket and batch-sprint) and BOTH modes use the same four dispatch points per ticket — Session Start -> Stage 1 -> Stage 2 -> Stage 3. The only difference is that batch mode loops them once per ticket. The full briefings (Goal / Context docs / Skills to load / Exact instructions / Report format / Rules) live in `references/sprint-orchestration.md` §"Sub-agent prompt templates".

| Stage                                              | Pattern    | Subagent role                                                                                                                                                                  |
|----------------------------------------------------|------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Session Start (per-ticket)                         | Single     | dispatch a session-start subagent: fetch ticket from issue tracker, load `.context/`, create the PBI folder + `context.md` + `test-session-memory.md`, return ticket summary + AC list |
| Stage 1 — Planning (ATP + draft TCs + risk triage) | Sequential | dispatch a Planning subagent: produce the ATP artifact + risk score + draft TC outlines; bug tickets get the veto + triage decision tree applied                                |
| Stage 2 — Execution (smoke + UI/API/DB exploration)| Sequential | dispatch an Execution subagent: smoke pass first, then triforce (UI/API/DB) exploration; capture evidence under the PBI folder; surface BUG_FOUND if applicable                  |
| Stage 3 — Reporting (ATR + QA comment + transition)| Sequential | dispatch a Reporting subagent: fill the ATR, post the QA comment, transition the issue, file bug reports if any                                                                 |

> **Modes are equivalent in dispatch shape**. Single-ticket mode runs ONE pass through these four dispatches. Batch mode loops them per ticket. There is no longer a "single-ticket inline" path — both modes pay the same 4-dispatch cost so behavior is uniform and reviews are consistent.

> **Sequential, not Parallel**: each stage feeds the next (Session Start's PBI folder is read by Stage 1; Stage 1's ATP is read by Stage 2; Stage 2's evidences are read by Stage 3). Parallelism inside a single ticket would race on shared PBI state.

> **On any subagent failure**: STOP, report the partial state (which stages completed, what artifacts landed), present retry / skip-stage / abort options. Do NOT auto-fix nor auto-rollback. See `.claude/skills/framework-core/references/orchestration-doctrine.md`.

---

## Scope — pick the mode first

| Mode | Input | Output | Use when |
|------|-------|--------|----------|
| **Single ticket — User Story** | One story ID (e.g. `{{PROJECT_KEY}}-123`) | ATP + ATR + TCs + QA comment + ticket moved to Tested | Full QA on one story end to end |
| **Single ticket — Bug** | One bug ID | Triage decision, then either Code-Review-only OR ATP + ATR + verification report | Retesting a bug fix on staging |
| **Batch sprint** | `SPRINT-{N}-TESTING.md` framework file | Per-ticket artifacts + updated framework file + session summary | Processing a whole sprint backlog, with interruption + resume support |

Rules for picking:

1. Story ID with status Ready-for-QA -> Single ticket / User Story.
2. Bug ID deployed to staging -> Single ticket / Bug.
3. Sprint number, "process sprint X", or an existing `SPRINT-{N}-TESTING.md` -> Batch sprint.
4. If the framework file does not exist yet, generate it first (see `sprint-orchestration.md`).

---

## Workflow — one pipeline for all modes

```
Session Start (always first)
    -> PBI folder + context.md + test-session-memory.md
    -> Story explanation, WAIT for user OK

Stage 1 — Planning
    -> For Story: triage risk + Test Analysis + create ATP/ATR/TCs
    -> For Bug:   veto check + Bug Analysis + create ATP/ATR (no TCs)
    -> See references/acceptance-test-planning.md and references/feature-test-planning.md

Stage 2 — Execution
    -> Smoke test is always first (Go / No-Go)
    -> Then UI / API / DB exploration per what changed
    -> Evidence into .context/PBI/{module}/{TICKET}/evidence/
    -> See references/exploration-patterns.md

Stage 3 — Reporting
    -> Fill ATR, post QA comment, transition ticket
    -> File bugs via bug-report template when found
    -> See references/reporting-templates.md

---> Hand off (cross-skill, NOT this skill):
       Stage 4 -> test-documentation
       Stage 5 -> test-automation
       Stage 6 -> regression-testing
```

Session-start is the universal entry. **Single-ticket mode runs the same 4 dispatches as batch mode**: Session Start -> Stage 1 -> Stage 2 -> Stage 3. The orchestrator dispatches them sequentially (each subagent's report feeds the next briefing's "Context docs"). The full briefings live in `references/sprint-orchestration.md`. Use them verbatim — do NOT inline any stage just because there is only one ticket. Batch mode loops these same four dispatches through Wave 1 PENDING tickets in the framework file and updates the framework file after each ticket.

---

## Session Start — the universal entry

Every invocation starts by initializing the session, even in batch mode. Session Start:

0. **Resolve TMS modality** (Xray on Jira vs Jira-native). This determines whether ATP/ATR will be created as Xray `Test Plan` / `Test Execution` issues (Modality A) or as Story custom-field + comment mirrors (Modality B). Full resolution algorithm lives in `test-documentation/SKILL.md` §Phase 0 — apply the same four-step probe here (CLAUDE.md -> master-test-plan.md -> list issue types -> ask the user). Persist the result into `test-session-memory.md`.
0.1. **Load required tool skills** — based on the TMS modality resolved in Step 0:
   - Always load `/acli` (all Jira ticket operations: story fetch, comment, transition, link, bug creation).
   - In **Modality A (Xray)**: also load `/xray-cli` for Test / Test Execution / Test Plan / Test Run operations.
   - In **Modality B (Jira-native)**: `/acli` alone covers both `[ISSUE_TRACKER_TOOL]` and `[TMS_TOOL]` pseudocode — no additional skill needed.
   This step is **mandatory before any pseudocode block below executes**. The skills carry the concrete syntax, flags, and JSON payloads this skill intentionally omits.
0.5. **Sprint roadmap checkpoint** (batch-sprint mode only — skip in single-ticket mode):
   - Detect batch mode from the user invocation ("process sprint N", "continue sprint", a `sprint-file` parameter, or any phrase that implies a sprint loop).
   - Check whether `.context/reports/SPRINT-{N}-TESTING.md` exists for the target sprint.
     - **Missing** -> generate it before entering the ticket loop. Delegate to `sprint-orchestration.md` §Part 1 — Sprint Roadmap Generator.
     - **Present but older than 24h, OR the user explicitly asks for a refresh** -> regenerate (warn + confirm overwrite).
     - **Present and fresh** -> proceed.
   - Single-ticket and bug-only invocations skip this step entirely — they do not need a roadmap file.
1. Fetches the ticket from `[ISSUE_TRACKER_TOOL]` (title, ACs, priority, comments).
2. Extracts Team Discussion from comments (decisions, tech notes, edge cases, blockers). Non-blocking.
3. Loads the project-wide context files: `.context/mapping/business-data-map.md`, `.context/mapping/business-feature-map.md`, `.context/mapping/business-api-map.md`, `.context/master-test-plan.md`.
4. Loads or creates `module-context.md` (3-level hierarchy: project -> module -> ticket).
5. Explores backend (`{{BACKEND_REPO}}`) + frontend (`{{FRONTEND_REPO}}`) code.
6. Finds test data candidates via `[DB_TOOL]` on `{{DB_MCP}}`.
7. Creates the PBI folder and files:
   ```
   .context/PBI/{module-name}/{{PROJECT_KEY}}-{number}-{brief-title}/
     context.md                # ticket context + Team Discussion + Related Code
     test-session-memory.md    # shared memory, stage-by-stage
     evidence/                 # screenshots, gitignored
   ```
8. Writes a Story Explanation and **STOPS** for user confirmation. Do not proceed until the user OK's.

Details, templates and error table live in `references/session-entry-points.md`.

---

## Mode branches — what changes after Session Start

> Both single-ticket and batch modes run the SAME 4-dispatch cadence (Session Start -> Stage 1 -> Stage 2 -> Stage 3) per ticket. Use the briefings in `references/sprint-orchestration.md` §"Sub-agent prompt templates" verbatim — do NOT inline a stage just because there is only one ticket. The previous "single-ticket inline" path is **REMOVED**. The notes below describe only what is *different* per ticket type or per mode (TMS payload shape, framework-file update timing, etc.). The dispatch sequence itself is invariant.

### Single-ticket, User Story (Stages 1 -> 2 -> 3)

Run the same 4 dispatches. Per-stage payload differences:

- Stage 1: Triage risk -> Test Analysis -> ATP/ATR -> TCs created with full traceability (`--story + --test-plan + --test-result`) -> verify with `[TMS_TOOL] trace`.
- Stage 2: Smoke test -> UI / API / DB exploration as applicable -> update TC statuses PASSED / FAILED -> file bugs if any.
- Stage 3: Fill ATR Test Report -> QA comment via `[ISSUE_TRACKER_TOOL]` -> transition ticket -> mirror into `test-report.md` in the PBI.
- Afterwards: hand off to `test-documentation` for ROI + Stage 4.

### Single-ticket, Bug (Triage -> Verify -> Report)

Run the same 4 dispatches; the Stage 1 briefing additionally applies the veto + risk-score decision tree before producing the ATP.

- Triage: veto table (see Gotchas) -> if SKIP, run Code-Review workflow and finish (Stage 2 + Stage 3 dispatches collapse to the in-place comment + transition; the orchestrator skips them only if the Stage 1 subagent reports `veto_outcome: skip`).
- Risk score only if no veto applies. 0-3 LOW, 4-7 MEDIUM (ask user), 8+ HIGH.
- Create ATP + ATR, no TCs (the bug is the test case). Fill Bug Analysis inside the ATP.
- Execute: reproduce original bug -> verify fix -> regression pass on adjacent areas -> DB cross-validation if data-integrity bug.
- Report: update ATR, post comment (Template C PASSED or Template D FAILED), provide 1-2 evidence screenshot paths to the user.

### Batch sprint

- Pre-step: generate `SPRINT-{N}-TESTING.md` from the sprint backlog if it does not exist (see `sprint-orchestration.md`).
- Loop: read Wave 1 for the first `PENDING` ticket, dispatch the same 4-stage sequence per ticket, after each ticket update the framework file + present a per-ticket summary + wait for user OK.
- Interrupted session: if `test-session-memory.md` already exists for the ticket, resume from the first incomplete stage.
- Stop on TOOL FAILURE. Pause on BUG_FOUND. Update framework file ONLY after Stage 3 completes.

---

## Gotchas — inline rules you must apply every invocation

1. **Credentials**: always from `.env`. Never hardcode. Never guess passwords.
2. **PBI folder naming**: `{module-name}` is kebab-case from the ticket's project/module field. `{brief-title}` is max 5 words, kebab-case, AI-generated from the ticket title.
3. **Bugs get ATP + ATR, no TCs**. The bug ticket is the implicit test case. Reproduction steps = test steps.
4. **Smoke test is mandatory** as the first action in Stage 2. If smoke fails (No-Go), stop and report — do not proceed to deep exploration.
5. **Bug veto table — SKIP retesting** when the bug is pure text / CSS / docs / config / tech-debt cleanup with no functional change. **REQUIRE retesting** regardless of score when it touches money, data integrity, auth, external integrations, state machines, or calculations. Veto beats risk score.
6. **TCs are created in Stage 1, NEVER in Stage 2**. Stage 2 executes what Planning produced; new TCs found during exploration are added via `[TMS_TOOL] tc create` but the rule is "planning first".
7. **Explain the story -> WAIT for OK**. Never auto-proceed past Session Start without user confirmation. Same for bug triage — present the decision and wait.
8. **Evidence directory**: always configure `.playwright/cli.config.json` `outputDir` to `.context/PBI/{module-name}/{ticket}/evidence/` BEFORE using `[AUTOMATION_TOOL]`. Screenshots need the full path in `--filename` because `outputDir` does not apply to `.png`.
9. **Traceability check after Stage 1**: run `[TMS_TOOL] trace {TICKET}` and verify Story -> ATP -> ATR and each TC -> Story + ATP + ATR. Bugs: traceability "gaps" for missing TCs are expected and OK.
10. **Batch mode stop/pause protocol**: TOOL FAILURE -> stop, report, await user. BUG_FOUND -> pause, present bug, await decision. NEVER dispatch the next sub-agent while unresolved.
11. **Framework file update timing**: only update `SPRINT-{N}-TESTING.md` AFTER Stage 3 completes and the orchestrator-side checklist verifies. Not earlier.
12. **Language**: all artifacts, TMS content, and commit messages in English. Mirror the user's language only in conversation.

---

## Cross-skill handoff — what this skill does NOT do

| After Stage 3 you need... | Load this skill | Reason |
|---------------------------|-----------------|--------|
| Formalize TCs in Jira/Xray, calculate ROI, decide Candidate / Manual / Deferred | `test-documentation` | Stage 4. This skill produces the inputs; `test-documentation` produces the formal regression backlog. |
| Write the automated test code (KATA Page / Api + test file) | `test-automation` | Stage 5. Plan -> Code -> Review pipeline. |
| Run the regression or smoke suite in CI and emit a GO/NO-GO verdict | `regression-testing` | Stage 6. This skill's Stage 2 smoke is local-manual, not the CI suite. |
| Generate `business-data-map.md`, `business-feature-map.md`, `business-api-map.md`, `master-test-plan.md` | `project-discovery` (or the individual `/business-*-map` and `/master-test-plan` commands) | Sprint-testing consumes these; it does not create them. |

If Session Start reports that any of the project-wide context files are missing, stop and hand off to `project-discovery` (or the relevant command). Do not continue without them.

---

## Pseudocode tags used here

| Tag | Resolves to | Defined in |
|-----|-------------|------------|
| `[TMS_TOOL]` | xray-cli skill, Atlassian MCP, or `{{TMS_CLI}}` | `CLAUDE.md` Tool Resolution |
| `[ISSUE_TRACKER_TOOL]` | `acli`, Atlassian MCP, or `{{ISSUE_TRACKER_CLI}}` | `CLAUDE.md` Tool Resolution |
| `[AUTOMATION_TOOL]` | playwright-cli skill or Playwright MCP | `CLAUDE.md` Tool Resolution |
| `[DB_TOOL]` | DBHub MCP or Supabase MCP | `CLAUDE.md` Tool Resolution |
| `[API_TOOL]` | OpenAPI MCP, Postman, or curl | `CLAUDE.md` Tool Resolution |

Concrete tools (`bun`, `git`, `gh`) are used literally. Project variables like `{{PROJECT_KEY}}`, `{{DB_MCP}}`, `{{WEB_URL}}` are resolved from `.agents/project.yaml` (env-scoped vars resolve to the active environment).

---

## References — read the narrow one for the situation

All references are self-contained. Load one at a time.

| Reference | Read when |
|-----------|-----------|
| `sprint-orchestration.md` | Running batch-sprint mode, generating the `SPRINT-{N}-TESTING.md` framework file, resuming a session, updating framework tables, dispatching stage sub-agents, handling stop/pause/`continue-from`. |
| `session-entry-points.md` | Initializing a session (any mode), loading project + module context, creating the PBI folder + `context.md` + `test-session-memory.md`, Team Discussion extraction rules, user-story workflow step order, bug Triage -> Verify -> Report workflow. |
| `acceptance-test-planning.md` | Stage 1 Planning — generating the ATP (Acceptance Test Plan) for a ticket, Test Analysis structure, TC nomenclature `{US_ID}: TC#: Validate <CORE> <CONDITIONAL>`, traceability creation + verification, and the Bug Analysis variant. |
| `feature-test-planning.md` | Stage 1 Planning at feature / multi-story level — building a feature test plan, risk triage rubric, scenario decomposition, and variable + test-data identification. |
| `exploration-patterns.md` | Stage 2 Execution — smoke-test Go/No-Go playbook, UI exploration on `{{WEB_URL}}`, API exploration on `{{API_URL}}`, DB cross-validation via `{{DB_MCP}}`, evidence naming + capture rules, edge-case checklist. |
| `reporting-templates.md` | Stage 3 Reporting — ATR Test Report body, bug report template (summary, reproduction, severity, priority, labels), QA comment templates (story PASSED/FAILED, bug Template C/D), evidence-attachment guidance. |

---

## Pre-flight checklist

- [ ] Mode picked (single-ticket / bug / batch)
- [ ] Session Start complete, user confirmed the story explanation
- [ ] Project-wide context files present (if missing, hand off to `project-discovery`)
- [ ] PBI folder + `context.md` + `test-session-memory.md` created
- [ ] `.env` credentials loaded (no hardcoded passwords)
- [ ] Bug path: veto table evaluated BEFORE risk score
- [ ] Stage 1 artifacts created with full traceability, verified via `[TMS_TOOL] trace`
- [ ] Stage 2 smoke test executed FIRST, Go/No-Go recorded
- [ ] Evidence captured under the ticket's `evidence/` folder
- [ ] Stage 3 ATR filled + QA comment posted + ticket transitioned
- [ ] Hand-off identified for Stages 4 / 5 / 6 if applicable
- [ ] Batch mode: framework file updated AFTER Stage 3 only, user OK'd next ticket
