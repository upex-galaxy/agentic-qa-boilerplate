---
name: sprint-testing
description: Orchestrates in-sprint manual QA per ticket across Stages 1 (Planning), 2 (Execution) and 3 (Reporting). Use for user-story testing, bug retesting, and batch-sprint QA loops. Creates the PBI folder, drives session-start, runs the triage + veto + risk-score decision tree on bugs, produces the ATP + ATR + TC artifacts in the TMS, executes smoke and trifuerza (UI/API/DB) exploration, and files the final QA comment + bug reports. Triggers on: test this ticket, QA this user story, retest this bug, verify bug fix, run exploratory testing, smoke test a feature, process the sprint, next ticket in sprint, generate the SPRINT-N-TESTING framework, resume sprint testing, continue-from a ticket. Do NOT use for Stage 4 TMS documentation + ROI (test-documentation), Stage 5 automation coding (test-automation), Stage 6 regression suite execution (regression-testing), or onboarding a new repo (project-discovery).
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
---

# Sprint Testing — Plan, Execute, Report per Ticket

Drive the manual / exploratory QA loop for a single ticket during a sprint. Three stages, always in this order: **Stage 1 Planning -> Stage 2 Execution -> Stage 3 Reporting**. Hand off afterwards to the skills that own Stage 4, 5 and 6.

The same three-stage pipeline runs in every mode. Only the entry point and the bookkeeping differ: one ticket at a time (single-ticket), or N tickets managed by a framework file (batch-sprint).

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

Session-start is the universal entry. Single-ticket modes run the pipeline once. Batch mode loops through Wave 1 PENDING tickets in the framework file, dispatches one sub-agent per stage, and updates the framework file after each ticket.

---

## Session Start — the universal entry

Every invocation starts by initializing the session, even in batch mode. Session Start:

1. Fetches the ticket from `[ISSUE_TRACKER_TOOL]` (title, ACs, priority, comments).
2. Extracts Team Discussion from comments (decisions, tech notes, edge cases, blockers). Non-blocking.
3. Loads the three project-wide context files: `.context/business-data-map.md`, `.context/api-architecture.md`, `.context/project-test-guide.md`.
4. Loads or creates `module-context.md` (3-level hierarchy: project -> module -> ticket).
5. Explores backend (`{{BACKEND_REPO}}`) + frontend (`{{FRONTEND_REPO}}`) code.
6. Finds test data candidates via `[DB_TOOL]` on `{{DB_MCP_STAGING}}`.
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

### Single-ticket, User Story (Stages 1 -> 2 -> 3)

- Stage 1: Triage risk -> Test Analysis -> ATP/ATR -> TCs created with full traceability (`--story + --test-plan + --test-result`) -> verify with `[TMS_TOOL] trace`.
- Stage 2: Smoke test -> UI / API / DB exploration as applicable -> update TC statuses PASSED / FAILED -> file bugs if any.
- Stage 3: Fill ATR Test Report -> QA comment via `[ISSUE_TRACKER_TOOL]` -> transition ticket -> mirror into `test-report.md` in the PBI.
- Afterwards: hand off to `test-documentation` for ROI + Stage 4.

### Single-ticket, Bug (Triage -> Verify -> Report)

- Triage: veto table (see Gotchas) -> if SKIP, run Code-Review workflow and finish. If REQUIRE, continue.
- Risk score only if no veto applies. 0-3 LOW, 4-7 MEDIUM (ask user), 8+ HIGH.
- Create ATP + ATR, no TCs (the bug is the test case). Fill Bug Analysis inside the ATP.
- Execute: reproduce original bug -> verify fix -> regression pass on adjacent areas -> DB cross-validation if data-integrity bug.
- Report: update ATR, post comment (Template C PASSED or Template D FAILED), provide 1-2 evidence screenshot paths to the user.

### Batch sprint

- Pre-step: generate `SPRINT-{N}-TESTING.md` from the sprint backlog if it does not exist (see `sprint-orchestration.md`).
- Loop: read Wave 1 for the first `PENDING` ticket, dispatch a sub-agent per stage sequentially, after each ticket update the framework file + present a per-ticket summary + wait for user OK.
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
| Generate `business-data-map.md`, `api-architecture.md`, `project-test-guide.md` | `project-discovery` | Sprint-testing consumes these; it does not create them. |

If Session Start reports that any of the three project-wide context files are missing, stop and hand off to `project-discovery`. Do not continue without them.

---

## Pseudocode tags used here

| Tag | Resolves to | Defined in |
|-----|-------------|------------|
| `[TMS_TOOL]` | xray-cli skill, Atlassian MCP, or `{{TMS_CLI}}` | `CLAUDE.md` Tool Resolution |
| `[ISSUE_TRACKER_TOOL]` | `acli`, Atlassian MCP, or `{{ISSUE_TRACKER_CLI}}` | `CLAUDE.md` Tool Resolution |
| `[AUTOMATION_TOOL]` | playwright-cli skill or Playwright MCP | `CLAUDE.md` Tool Resolution |
| `[DB_TOOL]` | DBHub MCP or Supabase MCP | `CLAUDE.md` Tool Resolution |
| `[API_TOOL]` | OpenAPI MCP, Postman, or curl | `CLAUDE.md` Tool Resolution |

Concrete tools (`bun`, `git`, `gh`) are used literally. Project variables like `{{PROJECT_KEY}}`, `{{DB_MCP_STAGING}}`, `{{SPA_URL_STAGING}}` are resolved from `CLAUDE.md`.

---

## References — read the narrow one for the situation

All references are self-contained. Load one at a time.

| Reference | Read when |
|-----------|-----------|
| `sprint-orchestration.md` | Running batch-sprint mode, generating the `SPRINT-{N}-TESTING.md` framework file, resuming a session, updating framework tables, dispatching stage sub-agents, handling stop/pause/`continue-from`. |
| `session-entry-points.md` | Initializing a session (any mode), loading project + module context, creating the PBI folder + `context.md` + `test-session-memory.md`, Team Discussion extraction rules, user-story workflow step order, bug Triage -> Verify -> Report workflow. |
| `acceptance-test-planning.md` | Stage 1 Planning — generating the ATP (Acceptance Test Plan) for a ticket, Test Analysis structure, TC nomenclature `{US_ID}: TC#: Validate <CORE> <CONDITIONAL>`, traceability creation + verification, and the Bug Analysis variant. |
| `feature-test-planning.md` | Stage 1 Planning at feature / multi-story level — building a feature test plan, risk triage rubric, scenario decomposition, and variable + test-data identification. |
| `exploration-patterns.md` | Stage 2 Execution — smoke-test Go/No-Go playbook, UI exploration on `{{SPA_URL_STAGING}}`, API exploration on `{{API_URL_STAGING}}`, DB cross-validation via `{{DB_MCP_STAGING}}`, evidence naming + capture rules, edge-case checklist. |
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
