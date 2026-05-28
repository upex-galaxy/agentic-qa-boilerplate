---
name: sprint-testing
description: "Orchestrates in-sprint manual QA per ticket across Stages 1 (Planning), 2 (Execution) and 3 (Reporting). Use for user-story testing, bug retesting, and batch-sprint QA loops. Creates the PBI folder, drives session-start, runs the triage + veto + risk-score decision tree on bugs, produces the ATP + ATR + TC artifacts in the TMS, executes smoke and trifuerza (UI/API/DB) exploration, and files the final QA comment + bug reports. Triggers on: test this ticket, QA this user story, retest this bug, verify bug fix, run exploratory testing, smoke test a feature, process the sprint, next ticket in sprint, generate the SPRINT-N-TESTING framework, resume sprint testing, continue-from a ticket. Do NOT use for Stage 4 TMS documentation + ROI (test-documentation), Stage 5 automation coding (test-automation), Stage 6 regression suite execution (regression-testing), or onboarding a new repo (project-discovery)."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
complementary_categories: [testing-e2e, testing-api, issue-tracker]
---

## Forbidden invocations

**NEVER invoke `/sdd-*` skills from this workflow.** SDD is an optional
user-installed ceremony; this skill ships self-contained and does not chain
SDD under any condition. If you need to refactor KATA, fixtures, cli/,
scripts/, or api/schemas/ pipeline, exit this skill first and invoke
`/framework-development` — which itself runs Plan → Code → Verify → Archive
natively (no SDD required).

This boundary is mechanical, not advisory: `scripts/lint-skills.ts` rejects
any `/sdd-` mention outside this section. See:
`.claude/skills/agentic-qa-core/references/skill-composition-strategy.md` §4
(governs users who manually install SDD).

# Sprint Testing — Plan, Execute, Report per Ticket

Drive the manual / exploratory QA loop for a single ticket during a sprint. Three stages, always in this order: **Stage 1 Planning -> Stage 2 Execution -> Stage 3 Reporting**. Hand off afterwards to the skills that own Stage 4, 5 and 6.

The same three-stage pipeline runs in every mode. Only the entry point and the bookkeeping differ: one ticket at a time (single-ticket), or N tickets managed by a framework file (batch-sprint).

---

## Inputs — read these first, in this order

Canonical reading order for any AI starting cold on a sprint-testing workflow. Read in order; stop earlier when the ticket is small enough that later inputs add no signal.

1. `.agents/project.yaml` — project identity, env URLs, `{{PROJECT_KEY}}`, MCP names, active environment.
2. `.agents/jira-required.yaml` — canonical slug catalog (custom fields, statuses, transitions) for the active workspace.
3. `.agents/jira-fields.json` — slug → numeric custom-field-ID mapping for `{{jira.<slug>}}` resolution at runtime.
4. `.agents/jira-workflows.json` — workflow + transition catalog (resolves Ready For QA → In Testing → Tested for Story / Bug / Test Case work types).
5. `.context/PBI/{module}/{TICKET-ID}-*/context.md` — ticket-local context: ACs, Team Discussion summary, session notes, open questions (read if it already exists from a prior Session Start).
6. `.context/master-test-plan.md` — regression Epic pointer, modality decision (Xray vs Jira-native), what to test and why.
7. `.context/business/business-feature-map.md` — feature catalog vocabulary; resolves "what module owns this story" for `{module-name}` PBI folder naming.
8. The Story or Bug ticket itself — AC, ATP, comments — fetched via `[ISSUE_TRACKER_TOOL]`. The ticket body is source-of-truth, not the local PBI mirror.
9. `.env` — `LOCAL_USER_*` / `STAGING_USER_*` credentials. NEVER hardcode; always read at runtime.
10. `kata-manifest.json` — registry of existing KATA Components + ATCs. Check before proposing new ATCs in Stage 3 hand-off so the test-automation phase doesn't duplicate work.

**Optional inputs.** `master-test-plan.md` and the business maps frequently arrive after `/project-discovery` runs and may be absent — proceed without them and surface a `missing_input` note in the Stage 1 ATP so a later pass can fill the gap. `kata-manifest.json` is only load-bearing at the Stage 3 → `test-automation` hand-off; skip in pure manual-QA invocations.

---

## Subagent Dispatch Strategy

> **Orchestration & Session contracts**: this skill follows `./orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `./session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 1 (plan write) are NOT optional.

This skill scopes per ticket. Single-ticket mode: `<scope>` = `<JIRA-KEY>` (e.g. `UPEX-123`). Batch-sprint mode: `<scope>` = `sprint-<N>/<JIRA-KEY>` (one nested directory per ticket in the wave). Session state lives at `.session/sprint-testing/<scope>/{plan.md, progress.md}` per `agentic-qa-core/references/session-management.md` §3 + §9. The per-ticket `test-session-memory.md` is a SEPARATE concern: it carries TMS modality + ticket context + stage state shared across the 4 sub-agent dispatches (domain memory). Both files coexist — `plan.md` indexes the session; `test-session-memory.md` holds the cross-stage shared payload.

This skill is compliant with the doctrine in `CLAUDE.md` §"Orchestration Mode (Subagent Strategy)" and the session contract in `.claude/skills/agentic-qa-core/references/session-management.md`. Every dispatch follows the 6-component briefing format defined in `.claude/skills/agentic-qa-core/references/briefing-template.md`, and the pattern selected per stage matches the decision guide in `.claude/skills/agentic-qa-core/references/dispatch-patterns.md`. This skill operates in two modes (single-ticket and batch-sprint) and BOTH modes use the same four dispatch points per ticket — Session Start -> Stage 1 -> Stage 2 -> Stage 3. The only difference is that batch mode loops them once per ticket. The full briefings (Goal / Context docs / Skills to load / Exact instructions / Report format / Rules) live in `references/sprint-orchestration.md` §"Sub-agent prompt templates".

| Stage                                              | Pattern    | Subagent role                                                                                                                                                                  |
|----------------------------------------------------|------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Session Start (per-ticket)                         | Single     | dispatch a session-start subagent: fetch ticket from issue tracker, load `.context/`, create the PBI folder + `context.md` + `test-session-memory.md`, return ticket summary + AC list |
| Stage 1 — Planning (ATP + draft TCs + risk triage) | Sequential | dispatch a Planning subagent: produce the ATP artifact + risk score + draft TC outlines; bug tickets get the veto + triage decision tree applied                                |
| Stage 2 — Execution (smoke + UI/API/DB exploration)| Sequential | dispatch an Execution subagent: smoke pass first, then triforce (UI/API/DB) exploration; capture evidence under the PBI folder; surface BUG_FOUND if applicable                  |
| Stage 3 — Reporting (ATR + QA comment + transition)| Sequential | dispatch a Reporting subagent: fill the ATR, post the QA comment, transition the issue, file bug reports if any                                                                 |

> **Modes are equivalent in dispatch shape**. Single-ticket mode runs ONE pass through these four dispatches. Batch mode loops them per ticket. There is no longer a "single-ticket inline" path — both modes pay the same 4-dispatch cost so behavior is uniform and reviews are consistent.

> **Sequential, not Parallel**: each stage feeds the next (Session Start's PBI folder is read by Stage 1; Stage 1's ATP is read by Stage 2; Stage 2's evidences are read by Stage 3). Parallelism inside a single ticket would race on shared PBI state.

> **On any subagent failure**: STOP, report the partial state (which stages completed, what artifacts landed), present retry / skip-stage / abort options. Do NOT auto-fix nor auto-rollback. See `.claude/skills/agentic-qa-core/references/orchestration-doctrine.md`.

---

## Scope — pick the mode first

| Mode | Input | Output | Use when |
|------|-------|--------|----------|
| **Single ticket — User Story** | One story ID (e.g. `{{PROJECT_KEY}}-123`) | ATP + ATR + TCs + QA comment + ticket moved to {{jira.status.story.qa_approved}} | Full QA on one story end to end |
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

## Phase 0 — Session resume check (MANDATORY, inline)

Before Session Start dispatch, run the resume contract from `agentic-qa-core/references/session-management.md` §4:

1. Compute prospective `<scope>` from invocation: `<JIRA-KEY>` (single-ticket) or `sprint-<N>/<JIRA-KEY>` (batch — once per ticket in the wave loop).
2. Check `.session/sprint-testing/<scope>/progress.md`.
3. If it does NOT exist → proceed to Session Start (writes `plan.md`).
4. If it DOES exist:
   - Read `plan.md` + tail of `progress.md`.
   - Optionally read `.context/PBI/{module}/{TICKET}/test-session-memory.md` for the per-ticket domain state (load-bearing across the 4 sub-agent dispatches).
   - Surface to the user: last completed stage (Session Start / Stage 1 / Stage 2 / Stage 3) + next stage + any unresolved BUG_FOUND or TOOL FAILURE from the last entry.
   - Offer **resume / restart / abort**. On `restart`, archive to `.session/.archive/<YYYY-MM-DD>-sprint-testing-<scope>-aborted/` first.

Batch-sprint mode: Phase 0 fires once per ticket as the loop enters it (NOT once at sprint-loop entry). Per-ticket resume keeps batch progress fine-grained.

---

## Session Start — the universal entry

Every invocation starts by initializing the session, even in batch mode. Session Start:

0. **Resolve TMS modality** (Xray on Jira vs Jira-native). This determines whether ATP/ATR will be created as Xray `Test Plan` / `Test Execution` issues (Modality jira-xray) or as Story custom-field + comment mirrors (Modality jira-native). Full resolution algorithm lives in `test-documentation/SKILL.md` §Phase 0 — apply the same four-step probe here (CLAUDE.md -> master-test-plan.md -> list issue types -> ask the user). Persist the result into `test-session-memory.md`.
0.1. **Load required tool skills** — based on the TMS modality resolved in Step 0:
   - Always load `/acli` (all Jira ticket operations: story fetch, comment, transition, link, bug creation).
   - In **Modality jira-xray**: also load `/xray-cli` for Test / Test Execution / Test Plan / Test Run operations.
   - In **Modality jira-native**: `/acli` alone covers both `[ISSUE_TRACKER_TOOL]` and `[TMS_TOOL]` pseudocode — no additional skill needed.
   This step is **mandatory before any pseudocode block below executes**. The skills carry the concrete syntax, flags, and JSON payloads this skill intentionally omits.
0.5. **Sprint roadmap checkpoint** (batch-sprint mode only — skip in single-ticket mode):
   - Detect batch mode from the user invocation ("process sprint N", "continue sprint", a `sprint-file` parameter, or any phrase that implies a sprint loop).
   - Check whether `.context/reports/SPRINT-{N}-TESTING.md` exists for the target sprint.
     - **Missing** -> generate it before entering the ticket loop. Delegate to `sprint-orchestration.md` §Part 1 — Sprint Roadmap Generator.
     - **Present but older than 24h, OR the user explicitly asks for a refresh** -> regenerate (warn + confirm overwrite).
     - **Present and fresh** -> proceed.
   - Single-ticket and bug-only invocations skip this step entirely — they do not need a roadmap file.
0.6. **Environment + inbox preflight** (orchestrator-inline, blocking gate — runs BEFORE Stage 1 authors any ATP):
   - Probe the active environment for reachability: a generic HTTP request to `{{WEB_URL}}` and `{{API_URL}}` root (HEAD or GET, e.g. `curl -sI {{WEB_URL}}`). Expect a 2xx/3xx (a login redirect counts as reachable). A hard failure on root — 404 / 410 / 5xx, connection refused, or a dead-deployment page (`DEPLOYMENT_NOT_FOUND` etc.) — means the env is not testable.
   - On hard failure: **STOP and surface to the user before Stage 1.** Do NOT dispatch the Session Start subagent and do NOT author an ATP against a dead env — that is the single highest-cost waste in a run. Offer the user a session env override (see Gotcha 15) if they have a working alternate URL.
   - **Inbox receive-check** (only when the ticket is email / magic-link / auth-token dependent — inferred from the invocation, ticket type, labels, or title): confirm the configured mailbox/provider can actually *receive*, not just send. A send-only provider (e.g. a domain configured for outbound only) cannot complete a magic-link flow. If it cannot receive, STOP and surface before Stage 1.
   - This is a *reachability* gate (is the env even up? can we get the email?), distinct from the Stage 2 smoke test (does the *feature* work?). Both run; they answer different questions — keep anti-pattern S7 and the smoke pass as-is.
1. Fetches the ticket from `[ISSUE_TRACKER_TOOL]` (title, ACs, priority, comments).
2. Extracts Team Discussion from comments (decisions, tech notes, edge cases, blockers). Non-blocking.
3. Loads the project-wide context files: `.context/business/business-data-map.md`, `.context/business/business-feature-map.md`, `.context/business/business-api-map.md`, `.context/master-test-plan.md`.
4. Loads or creates `module-context.md` (3-level hierarchy: project -> module -> ticket).
5. Explores backend (`{{BACKEND_REPO}}`) + frontend (`{{FRONTEND_REPO}}`) code.
6. Finds test data candidates via `[DB_TOOL]` on `{{DB_MCP}}`.
7. Creates the PBI folder and files:
   ```
   .context/PBI/{module-name}/{{PROJECT_KEY}}-{number}-{brief-title}/
     context.md                # ticket context + Team Discussion + Related Code
     test-session-memory.md    # shared memory across the 4 sub-agent dispatches
     evidence/                 # screenshots, gitignored
   ```
8. **Writes the session `plan.md`** at `.session/sprint-testing/<scope>/plan.md` per `agentic-qa-core/references/session-management.md` §6 — Goal (one sentence per ticket), Inputs (PBI paths + TMS modality + Team Discussion summary), Approach (mode + per-stage dispatch pattern), Phase breakdown (Session Start / Stage 1 / Stage 2 / Stage 3 with dispatch pointer + exit condition), Risks (from triage), Verification checklist, Cross-references (cites `context.md`, `test-session-memory.md`, `acceptance-test-plan.md`, `acceptance-test-results.md`).
9. Writes a Story Explanation and **STOPS** for user confirmation. Do not proceed until the user OK's.
10. After OK, appends the first progress entry `## Session Start — <ts>` with `status: completed`, `next: Stage 1 — Planning` to `.session/sprint-testing/<scope>/progress.md`.

Details, templates and error table live in `references/session-entry-points.md`.

---

## Mode branches — what changes after Session Start

> Both single-ticket and batch modes run the SAME 4-dispatch cadence (Session Start -> Stage 1 -> Stage 2 -> Stage 3) per ticket. Use the briefings in `references/sprint-orchestration.md` §"Sub-agent prompt templates" verbatim — do NOT inline a stage just because there is only one ticket. The previous "single-ticket inline" path is **REMOVED**. The notes below describe only what is *different* per ticket type or per mode (TMS payload shape, framework-file update timing, etc.). The dispatch sequence itself is invariant.

### Single-ticket, User Story (Stages 1 -> 2 -> 3)

Run the same 4 dispatches. Per-stage payload differences:

- Stage 1: Triage risk -> Test Analysis -> ATP/ATR -> TCs created with full traceability (`--story + --test-plan + --test-result`) -> verify with `[TMS_TOOL] trace`.
- Stage 2: Smoke test -> UI / API / DB exploration as applicable -> update TC statuses PASSED / FAILED -> file bugs if any.
- Stage 3: Fill ATR Test Report -> QA comment via `[ISSUE_TRACKER_TOOL]` -> transition ticket -> mirror into `test-report.md` in the PBI.
- **Per-stage progress checkpoint**: after each Stage subagent returns, the orchestrator appends a phase entry to `.session/sprint-testing/<scope>/progress.md` per `agentic-qa-core/references/session-management.md` §7 (`status: completed`, `dispatched_as: Sequential`, `next: Stage <N+1> | hand-off`).
- **Archive after Stage 3**: when Stage 3 completes (or veto-skip Code-Review variant finishes), the orchestrator moves `.session/sprint-testing/<scope>/` to `.session/.archive/<YYYY-MM-DD>-sprint-testing-<scope>/` and calls `mem_session_summary` per `agentic-qa-core/references/session-management.md` §8. PBI artifacts under `.context/PBI/` stay.
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
- **Interrupted session resume**: on loop entry per ticket, Phase 0 reads `.session/sprint-testing/sprint-<N>/<TICKET>/progress.md` (canonical resume signal per `agentic-qa-core/references/session-management.md` §4). Domain state for an in-flight ticket is in `.context/PBI/{module}/{TICKET}/test-session-memory.md` (load-bearing for the 4 sub-agent dispatches). The two files serve different concerns: `progress.md` decides "which stage is next?"; `test-session-memory.md` carries the per-ticket payload that each sub-agent reads. Both are checked.
- After each stage subagent returns, the orchestrator appends a phase entry to `progress.md` per `agentic-qa-core/references/session-management.md` §7. After Stage 3 completes, the orchestrator runs Archive: moves `.session/sprint-testing/<scope>/` to `.session/.archive/<YYYY-MM-DD>-sprint-testing-<scope>/` and calls `mem_session_summary`. The PBI artifacts under `.context/PBI/` and the framework file `SPRINT-{N}-TESTING.md` stay in place — those are the canonical deliverables.
- Stop on TOOL FAILURE. Pause on BUG_FOUND. Update framework file ONLY after Stage 3 completes.

---

## Gotchas — inline rules you must apply every invocation

1. **Credentials**: always from `.env`. Never hardcode. Never guess passwords.
2. **PBI folder naming**: `{module-name}` is kebab-case from the ticket's project/module field. `{brief-title}` is max 5 words, kebab-case, AI-generated from the ticket title.
3. **Bugs get ATP + ATR, no TCs**. The bug ticket is the implicit test case. Reproduction steps = test steps.
4. **Smoke test is mandatory** as the first action in Stage 2. If smoke fails (No-Go), stop and report — do not proceed to deep exploration. Smoke failure is an env-level blocker and always stops; deep-exploration findings follow the graduated rule in #10 (a FAIL mid-pass is not auto-Critical).
5. **Bug veto table — SKIP retesting** when the bug is pure text / CSS / docs / config / tech-debt cleanup with no functional change. **REQUIRE retesting** regardless of score when it touches money, data integrity, auth, external integrations, state machines, or calculations. Veto beats risk score.
6. **TCs are created in Stage 1, NEVER in Stage 2**. Stage 2 executes what Planning produced; new TCs found during exploration are added via `[TMS_TOOL] tc create` but the rule is "planning first".
7. **Explain the story -> WAIT for OK**. Never auto-proceed past Session Start without user confirmation. Same for bug triage — present the decision and wait.
8. **Evidence directory**: always configure `.playwright/cli.config.json` `outputDir` to `.context/PBI/{module-name}/{ticket}/evidence/` BEFORE using `[AUTOMATION_TOOL]`. Screenshots need the full path in `--filename` because `outputDir` does not apply to `.png`.
9. **Traceability check after Stage 1**: run `[TMS_TOOL] trace {TICKET}` and verify Story -> ATP -> ATR and each TC -> Story + ATP + ATR. Bugs: traceability "gaps" for missing TCs are expected and OK.
10. **Graduated stop/pause protocol**: TOOL FAILURE -> stop, report, await user. **Blocking** BUG_FOUND (smoke/env down, data integrity, security-exploitable) -> pause, present bug, await decision; NEVER dispatch the next sub-agent while unresolved. **Non-blocking** finding (cosmetic, minor validation, edge-case on a non-critical TC, framework-default pending recalibration) -> the Execution subagent logs it and CONTINUES the pass; the orchestrator surfaces it at Stage 2 close. A FAIL is not auto-Critical — triage first (severity per `references/reporting-templates.md` §1.4; security/auth/framework-default recalibrated at §5.0). See `references/exploration-patterns.md` "Finding triage".
11. **Framework file update timing**: only update `SPRINT-{N}-TESTING.md` AFTER Stage 3 completes and the orchestrator-side checklist verifies. Not earlier.
12. **Language**: all artifacts, TMS content, and commit messages in English. Mirror the user's language only in conversation.
13. **Environment + inbox preflight before ATP**: Session Start §0.6 probes `{{WEB_URL}}` / `{{API_URL}}` for reachability (and, for email/auth-dependent stories, that the inbox can *receive*) BEFORE any ATP/Jira write. A dead env or send-only inbox is caught here with a STOP, not at Stage 2 after the ATP is already authored. Reachability gate ≠ Stage 2 smoke — see S7.
14. **Severity recalibration before blocking a Story**: a Story TC FAIL is NOT automatically a blocking defect. When the failing TC is security/auth/framework-default class (cookie flags, CSP/HSTS headers, SDK-by-design behavior), run the recalibration gate (`references/reporting-templates.md` §5.0) BEFORE firing `{{jira.transition.story.defect_reported}}`/blocked: state the framework-default/mitigation hypothesis, cite one verification fact, surface to the user. A recalibrated finding becomes GO-with-debt (`PASSED WITH ISSUES`), not a blocker. Mechanical path stays the default for ordinary functional FAILs.
15. **Session env override**: to test against an ad-hoc URL not in `.agents/project.yaml` (broken staging, ephemeral preview deploy, hotfix branch URL), record it ONCE in `test-session-memory.md` §Environment as `WEB_URL_OVERRIDE` / `API_URL_OVERRIDE`. When set, it beats the `project.yaml` active-env value for every stage and is read automatically by all four dispatches — never re-thread it per briefing, and never write it to `project.yaml` (session-only). Distinct from `active_env` switching, which picks a *named* env from `project.yaml`.

---

## Cross-skill handoff — what this skill does NOT do

| Predecessor | Load this skill | Reason |
|-------------|-----------------|--------|
| Pre-sprint AC refinement on a batch of backlog Stories | `shift-left-testing` | Stage 0. If the Story passed through `/shift-left-testing` and carries label `shift-left-reviewed` with a dated label <30 days old, Stage 1 here short-circuits Phases 1-3 of `acceptance-test-planning.md` and continues from Phase 4. If the Story did NOT pass through Shift-Left, Stage 1 runs all phases in full — but this is more expensive in-sprint than pre-sprint. |

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
| `../agentic-qa-core/references/session-management.md` | Phase 0 + Session Start + per-stage checkpoints + Archive — resume contract, plan.md/progress.md schemas, archive policy, Engram per-phase checkpoint. This skill is a producer of `session/sprint-testing/<scope>/...` topic keys. |

---

## Anti-patterns — NEVER do these

- **S1.** NEVER mark a Story Ready For Release (or transition to {{jira.status.story.qa_approved}}) without QA sign-off AND a signed-off ATR snapshot for audit trail.
- **S2.** NEVER skip the Stage 1 Test Plan (ATP) step in Modality jira-xray workflows — the Xray `Test Plan` / `Test Execution` issues depend on the ATP being committed first; downstream TCs cannot link without it.
- **S3.** NEVER push test results to Jira without an ATR snapshot. The QA comment is a summary; the ATR is the audit record.
- **S4.** NEVER duplicate the ATR across Jira + Confluence (or any second store). Single source of truth — pick one per the modality decision in `.context/master-test-plan.md` and link from anywhere else.
- **S5.** NEVER bypass the bug-triage decision tree (veto → risk-score → Severity + Root Cause) when a test fails. Every failure gets a triage before it becomes a Bug ticket.
- **S6.** NEVER write ATP / ATR bodies in raw ADF JSON by hand. Use md-to-adf via `[ISSUE_TRACKER_TOOL]` so formatting survives Jira's renderer.
- **S7.** NEVER skip the smoke pass before triforce (UI / API / DB) exploration. Smoke validates the environment; triforce validates the feature. Order matters — a broken env produces false-positive bug reports.
- **S8.** NEVER mix UI + API + DB findings into a single bug ticket. File per layer (or per root-cause cluster) so triage and routing stay clean.
- **S9.** NEVER reuse a PBI folder across tickets. Every Story or Bug gets its own `.context/PBI/{module}/{TICKET-ID}-{brief-title}/` directory; cross-ticket contamination breaks evidence + traceability.
- **S10.** NEVER transition the ticket Ready For QA → In Testing without explaining the story to the user AND waiting for confirmation (CLAUDE.md §8 — Session Start is not a one-shot, it's a hand-off gate).
- **S11.** NEVER skip the auto-stage promote (Session Start → Stage 1 → Stage 2 → Stage 3) after a phase completes — each promote is a checkpoint that writes a `progress.md` entry and feeds the next subagent's Context docs.
- **S12.** NEVER file a bug without a reproducible repro path AND evidence (screenshot, trace, log, network HAR, or DB row reference). "It failed for me once" is not a bug ticket.
- **S13.** NEVER hardcode `customfield_NNNNN` IDs in ATP / ATR / QA comments or in any reference under this skill. Resolve every Jira field via `{{jira.<slug>}}` against `.agents/jira-required.yaml`.

---

## Pre-flight checklist

- [ ] Phase 0 — Session resume check ran (read `.session/sprint-testing/<scope>/progress.md`); user chose resume / restart / abort if prior state existed
- [ ] Mode picked (single-ticket / bug / batch)
- [ ] Session Start complete, user confirmed the story explanation
- [ ] `.session/sprint-testing/<scope>/plan.md` written (per `session-management.md` §6 schema)
- [ ] Project-wide context files present (if missing, hand off to `project-discovery`)
- [ ] PBI folder + `context.md` + `test-session-memory.md` created
- [ ] `.env` credentials loaded (no hardcoded passwords)
- [ ] Bug path: veto table evaluated BEFORE risk score
- [ ] Stage 1 artifacts created with full traceability, verified via `[TMS_TOOL] trace`
- [ ] Stage 2 smoke test executed FIRST, Go/No-Go recorded
- [ ] Evidence captured under the ticket's `evidence/` folder
- [ ] Stage 3 ATR filled + QA comment posted + ticket transitioned
- [ ] Per-stage progress checkpoint appended to `.session/sprint-testing/<scope>/progress.md` after each Stage subagent returned
- [ ] Archive: `.session/sprint-testing/<scope>/` moved to `.session/.archive/<YYYY-MM-DD>-sprint-testing-<scope>/` and `mem_session_summary` called after Stage 3
- [ ] Hand-off identified for Stages 4 / 5 / 6 if applicable
- [ ] Batch mode: framework file updated AFTER Stage 3 only, user OK'd next ticket
