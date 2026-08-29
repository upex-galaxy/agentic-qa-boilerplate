---
name: shift-left-testing
description: "Orchestrates pre-sprint Shift-Left QA on a batch of backlog Stories. Use when the user wants to refine acceptance criteria, surface ambiguities + gaps, draft an ATP outline, and hand off to PO/Dev BEFORE the Story enters a sprint — so defects are prevented in the requirements, not detected after implementation. Triggers on: shift-left testing, shift-left these stories, groom the backlog, pre-sprint QA, refine these N stories, pre-sprint refinement batch, prepare backlog for sprint planning, run AC refinement on UPEX-100/101/102, run shift-left QA, do early-game testing, pre-sprint test planning. ALSO trigger when the user pastes a comma-separated list of Story IDs sitting in Backlog / Shift-Left QA / Estimation / Ready For Dev and asks any variant of \"refine\", \"groom\", \"clean these ACs\", \"shift-left these\". Do NOT use for: in-sprint manual QA per ticket (use /sprint-testing — entry status is Ready For QA, this skill's entry status is Backlog/Shift-Left QA), Stage 4 TMS documentation + ROI (test-documentation), Stage 5 automation code (test-automation), Stage 6 regression suite execution (regression-testing), bugs (this skill only accepts Stories — bugs are reactive and have no upstream ACs to refine), epic-level test strategy (use feature-test-planning inside /sprint-testing for that)."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
complementary_categories: [testing-e2e, issue-tracker, tms]
---

## Inputs

Read in order; stop earlier when the batch is small enough that later inputs add no signal.

1. `.context/business/business-feature-map.md` + `.context/business/business-data-map.md` + `.context/business/business-api-map.md` — domain vocabulary, entity model, CRUD matrix, auth model + endpoint contracts. Anchors refined ACs in real entities, flows, and API behavior. (All three are hard-required by the Readiness Preflight Gate + Phase 0.3.)
2. `.context/master-test-plan.md` — regression Epic + in-scope modules. Tells the refinement whether the Story falls inside an already-prioritized area.
3. The Story's Acceptance Criteria + `**Source spec:**` reference on Jira. Detailed read via `bun run jira:sync-issues get <STORY_KEY> --include-comments`, then read the synced `acceptance-criteria.md` (+ description). NEVER `acli view` for custom fields. Canonical input — every refined AC must trace back here.
4. `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/` if a PBI folder already exists for this Story (created by a prior `/sprint-testing` cycle). Carries earlier session notes worth honoring.
5. `.agents/jira-workflows.json` — Story workflow + valid transitions (`backlog -> shift_left_qa -> estimation`). Source of `{{jira.transition.story.*}}` slugs used in Phase 3. ALSO the resolver for the `[QA] Shift-Left Review` tracking subtask: read it to confirm a subtask work type exists (+ its transitions) before Phase 1 creates any subtask; if the catalog has no subtask work type, the subtask steps are skipped with a warning — never blocked on.
6. `.agents/jira-required.yaml` — canonical slug catalog. Source of `{{jira.acceptance_test_plan}}` and other Jira field slugs touched in handoff.

---

## Forbidden invocations

**NEVER invoke `/sdd-*` skills from this workflow.** SDD is an optional
user-installed ceremony; this skill ships self-contained and does not chain
SDD under any condition. If you need to refactor KATA, fixtures, cli/,
scripts/, or api/schemas/ pipeline, exit this skill first and invoke
`/framework-development`.

This boundary is mechanical, not advisory: `scripts/lint-skills.ts` rejects
any `/sdd-` mention outside this section. See:
`.agents/skills/agentic-qa-core/references/skill-composition-strategy.md` §4
(governs users who manually install SDD).

# Shift-Left Testing — Pre-Sprint AC Refinement on a Backlog Batch

Drive Stage 0 — the pre-sprint Shift-Left loop — on a set of backlog Stories. Three phases, always in this order: **Phase 1 Selection -> Phase 2 Refinement -> Phase 3 Handoff**. Hand off afterwards to `/sprint-testing` once each Story reaches `Ready For QA`.

The skill is **batch-by-design**: one session refines N Stories from the backlog so PO + Dev lead can run a single grooming pass with the team. There is no single-issue mode — for a one-off urgent refinement, pass a list of length 1; the cadence stays the same.

---

## Why this skill exists (separation from `/sprint-testing`)

| Eje | `/sprint-testing` | `/shift-left-testing` |
|-----|-------------------|----------------------|
| Cadence | In-sprint, ticket-by-ticket loop | Pre-sprint, batch grooming of N Stories |
| Entry status | `{{jira.status.story.ready_for_qa}}` | `{{jira.status.story.backlog}}` / `shift_left_qa` / `estimation` / `ready_for_dev` |
| Exit status | `{{jira.status.story.qa_approved}}` (full execution) | `{{jira.status.story.estimation}}` (refined, awaiting estimate by PO + Dev) |
| Audience | Dev + tester | PO / BA + tester (Dev lead optional) |
| Output | ATP + ATR + bugs + execution evidence | Refined ACs + risk map + pre-sprint ATP in the Story field (outlines only) + `[QA] Shift-Left Review` subtask + batch report |
| Execution | Smoke + UI / API / DB exploration | NONE — feature does not exist yet |
| Code reads | Deep, targeted (reproduce / verify) | Light (feasibility only — does the codebase support this?) |
| TC creation | Yes (TCs created in Stage 1) | No — Stage 4 (`test-documentation`) creates TCs after the Story ships |
| Sprint-testing later | Runs full pipeline | Short-circuits Phases 1-3 (label `shift-left-reviewed` detected) and just validates |

The reuse story is **deliberate**: ~70% of the refinement logic already lives in `sprint-testing/references/acceptance-test-planning.md` Phases 1-3. This skill cites that reference instead of duplicating it — see Phase 2 below.

---

## Dependencies

Requires `agentic-qa-core`. Loads on demand:

- `agentic-qa-core/references/test-design-doctrine.md` — **MANDATORY before refining ACs or estimating outline coverage.** A refinement that does not surface risk-beyond-AC and 1:N coverage is incomplete.
- `agentic-qa-core/references/defect-management-doctrine.md` — **MANDATORY for the QA-Assignee hook (Part 2).** This skill is the EARLIEST QA pickup of a backlog Story: when a QA takes a Story into Shift-Left refinement, set `qa_assignee` to the authenticated session user (self) — read-before-write, NEVER overwrite an existing owner except on explicit, justified handover. This skill still files NO Bug/Defect/Improvement (Phase 1 rejects non-Story types); only the QA-Assignee semantics of Part 2 apply here.
- `agentic-qa-core/references/briefing-template.md`, `agentic-qa-core/references/dispatch-patterns.md`, `agentic-qa-core/references/orchestration-doctrine.md`, `agentic-qa-core/references/session-management.md`, `agentic-qa-core/references/preflight-gate.md` — cited inline by the sections that use them.

## Compact Rules

**Test-design doctrine (binding — full canon: `agentic-qa-core/references/test-design-doctrine.md`):**

- ACs are the FLOOR. Refinement's job is to push past the happy-path contract: surface the boundaries, exceptions, states, and anomalies the Story is silent on.
- 1:N is the default: a non-trivial AC implies multiple outlines (valid partition + each distinct invalid + boundaries + states). A 1-outline AC requires a written "trivially atomic" justification — never the default.
- Tag each refinement gap to a technique: ranges/limits → BVA; status/lifecycle fields → State-Transition; 2+ interacting conditions → Decision Table; 3+ combinable factors → Pairwise.
- A refined AC (Given/When/Then) is the business assertion; the outline (`Should <behavior> <condition>`) is its exploration. Keep them distinct.

**Shift-left operational rules:**

- Stories ONLY (no bugs — nothing to refine upstream). Entry status Backlog / Shift-Left QA / Estimation / Ready For Dev.
- Output = refined ACs + gap/ambiguity questions + the pre-sprint ATP in the `{{jira.acceptance_test_plan}}` field (outline NAMES + coverage estimate, no test code, no execution, NO Test Plan item — `/sprint-testing` Stage 1 creates the item from the field) + the closed `[QA] Shift-Left Review` subtask + the batch report.
- Tracking subtask `[QA] Shift-Left Review` per accepted Story: find-or-create in Phase 1 (transition to In Progress), close in Phase 3 handoff (transition to Done). Exhaustive session annotations (long analysis, refinement traces) go on the SUBTASK, keeping the Story clean. Work type + transitions resolved from `.agents/jira-workflows.json`; no subtask work type in the catalog → skip with a warning, never block.
- The heart of the skill (Phase 2) = edge cases not in story + ambiguities + gaps — feed them to PO/Dev as questions AND as derived outlines.
- On taking a Story into refinement (first QA pickup), set `qa_assignee` to self — read-before-write, never overwrite an existing owner (`agentic-qa-core/references/defect-management-doctrine.md` Part 2). This skill files NO Bug/Defect/Improvement; only the QA-Assignee hook applies.
- On completion: add label `shift-left-reviewed`; transition Backlog → Shift-Left QA → Estimation.

**Read full SKILL.md when**: running the batch grooming pipeline, writing the per-Story `shift-left-refinement.md`, or handling the PO/Dev handoff.

---

## Subagent Dispatch Strategy

> **Orchestration & Session contracts**: this skill follows `agentic-qa-core/references/orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `agentic-qa-core/references/session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 1 (plan write) are NOT optional. The orchestrator also applies the per-stage **Definition-of-Done gates** in `agentic-qa-core/references/stage-gates.md`: verify a stage's DoD (planning stages include the Test-Design Checklist) BEFORE recording its progress checkpoint and advancing.

This skill is **per-batch scope**: `<scope>` = `<YYYY-MM-DD>-<descriptor>` (e.g. `2026-05-20-payments-area`). Session state lives at `.session/shift-left-testing/<YYYY-MM-DD>-<descriptor>/{plan.md, progress.md}` per `agentic-qa-core/references/session-management.md` §3 + §9. The per-Story `shift-left-refinement.md` files stay under each Story's PBI folder (`[LOCAL]` staging buffer for Phase 2 → Phase 3 — disposable once Phase 3 publishes to Jira; see `references/atp-outline-template.md` and `.context/PBI/README.md`).

This skill is compliant with the doctrine in `AGENTS.md` §"Orchestration Mode (Subagent Strategy)" and the session contract in `.agents/skills/agentic-qa-core/references/session-management.md`. Every dispatch follows the 7-component briefing format defined in `.agents/skills/agentic-qa-core/references/briefing-template.md`, and the pattern selected per phase matches the decision guide in `.agents/skills/agentic-qa-core/references/dispatch-patterns.md`.

| Phase | Pattern | Subagent role |
|-------|---------|---------------|
| Phase 1 — Selection | Single | Backlog Selection subagent: pull candidate Stories via `[ISSUE_TRACKER_TOOL]`, apply veto + risk-score triage, return ranked candidate table. After user OK: find-or-create the `[QA] Shift-Left Review` subtask under each accepted Story + transition it to In Progress (skip with warning if the catalog has no subtask work type) |
| Phase 2 — Refinement (per Story) | Sequential — looped per Story | Refinement subagent: load `acceptance-test-planning.md` Phases 1-3 + outline-only Phase 4, write `shift-left-refinement.md`, append PO/Dev questions, return summary block. ONE subagent per Story. NEVER parallel across Stories (each subagent writes a different PBI file but the orchestrator must present each summary to the user sequentially before the next dispatch) |
| Phase 3 — Handoff (per Story) | Sequential — looped per Story | Handoff subagent: update Jira description + `{{jira.acceptance_test_plan}}` custom field (both modalities — no Test Plan item pre-sprint) + handoff comment + labels + subtask annotations + subtask transition to Done + Story transition `backlog -> shift_left_qa -> estimation`. Returns transition log + trace verification |
| Phase 3 — Batch report | Single | Batch Report subagent: aggregate per-Story summaries into `.session/shift-left-testing/<batch-id>/batch-report.md` + post to parent epic if Stories share one |

> **Sequential by design**. Phase 2 refinement looks parallelizable (each Story is independent in Jira), but the orchestrator must present each Story's refinement summary to the user before moving on. This keeps the user in the loop, lets them veto a Story mid-batch, and matches the team-grooming cadence the skill is designed for. Parallelism would burn the user's attention budget.

> **On any subagent failure**: STOP, report the partial state (which Stories refined, which Jira mutations landed), present retry / skip-story / abort options. Do NOT auto-fix nor auto-rollback. Jira mutations are recorded in the batch report so partial sessions are resumable. See `.agents/skills/agentic-qa-core/references/orchestration-doctrine.md`.

---

## Workflow — one pipeline, three phases

```
Phase 0 — Session resume check + Session Init (always first)
    -> Check .session/shift-left-testing/<batch-id>/progress.md → offer resume / restart / abort
    -> Resolve TMS modality (A: Xray / B: Jira-native — recorded for Stage 1; the
       pre-sprint ATP write is field-first in BOTH modalities)
    -> Load /acli (no /xray-cli — this skill creates no TMS items)
    -> Verify project-wide context files
    -> Resolve candidate list (explicit IDs OR backlog JQL)
    -> Create session folder .session/shift-left-testing/<YYYY-MM-DD>-<descriptor>/
       (writes plan.md after candidate list confirmed; progress.md appended per phase)

Phase 1 — Selection
    -> Detailed-read each candidate via `bun run jira:sync-issues get <STORY> --include-comments`
       (batch: `jql "<backlog JQL>"`), then read the synced .md
    -> Reject non-Story types (Bug / Spike / Sub-task / Tech-debt)
    -> Apply veto + risk-score triage per candidate
    -> Present ranked candidate table -> WAIT for user OK
    -> Per accepted Story: find-or-create subtask "[QA] Shift-Left Review"
       -> In Progress (skip + warn if no subtask work type in the catalog)

Phase 2 — Refinement (loop per accepted Story)
    -> Dispatch Refinement subagent: produce shift-left-refinement.md
       (Critical Analysis + Story Quality Analysis + Refined ACs + ATP outlines)
    -> Reuses sprint-testing/references/acceptance-test-planning.md §Phases 1-3
       with shift-left-mode delta (no test-data generation, no parametrization tables, outline names only)
    -> Present per-Story summary -> WAIT for user OK before next Story

Phase 3 — Handoff
    -> Per Story sequentially:
         - Update Jira description with "QA Refinements (Shift-Left Analysis)"
         - Populate the ATP field {{jira.acceptance_test_plan}} (both modalities;
           fallback: "## Acceptance Test Plan (ATP)" comment when the field is absent.
           NO Test Plan item — /sprint-testing Stage 1 creates it from the field)
         - Labels: shift-left-reviewed + shift-left-{YYYY-MM-DD}
         - Transition: backlog -> shift_left_qa (analyze) -> estimation (estimate)
         - Subtask "[QA] Shift-Left Review": post session annotations -> Done
         - Verify trace
    -> Batch report posted to .session/shift-left-testing/<batch-id>/batch-report.md
       + posted as comment on parent epic if Stories share one
    -> Archive: orchestrator moves .session/shift-left-testing/<batch-id>/ to
       .session/.archive/<YYYY-MM-DD>-shift-left-testing-<batch-id>/
       per agentic-qa-core/references/session-management.md §8

---> Cross-skill handoff (NOT this skill):
       When each Story later reaches Ready For QA:
         /sprint-testing reads label `shift-left-reviewed` and short-circuits
         Phases 1-3 to validation-only (sprint-testing/references/acceptance-test-planning.md §Phase 0).
         Stage 1 ALSO creates the Test Plan item (`ATP: {STORY-KEY}: {title}`)
         FROM the {{jira.acceptance_test_plan}} field content — the item is
         in-sprint work, never pre-sprint.
```

---

## Readiness Preflight Gate (MANDATORY — runs before Phase 0)

> Full doctrine: `agentic-qa-core/references/preflight-gate.md`. Runs FIRST, before the resume check. Two laws: (1) **args-as-answers** — treat anything the user already stated (the Story IDs, the modality, "groom the backlog") as provided args; ask only real gaps. (2) **probe, don't assume**. Surface gaps + REDs as ONE `AskUserQuestion` checklist; self-fix with approval + explanation; STOP on any blocking RED. This skill does NO live execution (no env/DB/API/browser), so its gate is light — it is mostly a tooling + context readiness check. **Generic baseline** (env resolution, test-user creds, secret/restart handling, the two laws, output contract) is inherited from the reference §3.1 — not repeated here. Below is only this skill's **specific capability delta**.

| Capability | Need | Why here |
|---|---|---|
| Issue-tracker (`[ISSUE_TRACKER_TOOL]`) | REQUIRED | All refinement output lands on Jira (description, ATP field, comment, labels, transitions). Load `/acli`; validate setup via `bun run jira:check`. |
| TMS modality resolved | REQUIRED | Recorded in `plan.md` and carried into the handoff so `/sprint-testing` Stage 1 knows which engine will materialize the Test Plan item later. The pre-sprint ATP write itself is modality-independent — field-first in both. 4-step probe; ask only if all auto-checks fail. |
| `/xray-cli` + `XRAY_*` creds | NOT NEEDED | Shift-Left creates no TMS items in either modality. The pre-sprint ATP lives in the `{{jira.acceptance_test_plan}}` field (fallback: comment); the Test Plan item is created by `/sprint-testing` Stage 1 from the field content. |
| Business context files | REQUIRED | `.context/business/*` + `.context/master-test-plan.md` — refinement without them produces low-value questions. Missing → hand off to `/project-discovery`. |
| Candidate Story list | REQUIRED | Explicit IDs (args) or a backlog JQL. Confirm size with the user before Phase 1. |

Env reachability, test-user creds, DBHub, OpenAPI/`API_TOKEN`, Playwright and `resend` are **N/A** here — shift-left never executes against a running system. After the gate clears (all REQUIRED GREEN), continue to Phase 0 below.

---

## Phase 0 — Session resume check + Session Init

0.0 **Session resume check** (per `agentic-qa-core/references/session-management.md` §4). Compute `<batch-id>` = `<YYYY-MM-DD>-<descriptor>` from the invocation context. Check `.session/shift-left-testing/<batch-id>/progress.md`. If it exists, read `plan.md` + the tail of `progress.md`, surface the last completed phase + next planned phase + any blocking notes, and offer **resume / restart / abort**. On `restart`, archive the current directory to `.session/.archive/<YYYY-MM-DD>-shift-left-testing-<batch-id>-aborted/` before proceeding. On `abort`, stop here.

0.1 **Resolve TMS modality**. Same 4-step probe as `sprint-testing` Session Start (`test-documentation/SKILL.md` §Phase 0). Persist the result in `.session/shift-left-testing/<batch-id>/plan.md` (under the `## Inputs` H2 — the plan.md is the canonical record per session-management §6).

0.2 **Load required tool skills**:
   - Always load `/acli` (custom-field update, comment, transition, label, subtask create — all writes; plus the trivial key+summary+status candidate search). Story DETAIL reads (description, ACs, scope, comments, parent epic) go through `bun run jira:sync-issues get/jql` — NOT `acli view`.
   - `/xray-cli` is NOT loaded by this skill. Shift-Left creates no TMS items in either modality: the pre-sprint ATP lives in the `{{jira.acceptance_test_plan}}` custom field (fallback: the `## Acceptance Test Plan (ATP)` comment when the field is absent). The Test Plan ITEM is created by `/sprint-testing` Stage 1 from the field content, once PO has estimated and the Story enters the sprint.
   - Both modalities: `/acli` alone covers every write this skill performs.

   This step is **mandatory before any pseudocode block below executes**. The skills carry the concrete syntax, flags, and JSON payloads this skill intentionally omits.

0.3 **Verify project-wide context files exist**:
   - `.context/business/business-data-map.md`
   - `.context/business/business-feature-map.md`
   - `.context/business/business-api-map.md`
   - `.context/master-test-plan.md`

   If any of these is missing, STOP and hand off to `project-discovery` (or the individual `/business-*-map` and `/master-test-plan` commands). Shift-left refinement without business context produces low-value PO/Dev questions and bloats the batch report.

0.4 **Resolve the candidate Story list**. Two modes:

   - **Explicit IDs** — user passes `UPEX-100,101,102,103` (or any natural-language list of Story keys). Use these verbatim; no JQL.
   - **Backlog JQL** — user says "groom the backlog" with no IDs. Build a JQL via `[ISSUE_TRACKER_TOOL]` filtering on:
     - `project = {{PROJECT_KEY}}`
     - `issueType = Story`
     - `status in ({{jira.status.story.backlog}}, {{jira.status.story.shift_left_qa}}, {{jira.status.story.estimation}}, {{jira.status.story.ready_for_dev}})`
     - Optionally `sprint in openSprints()` if the user says "next sprint candidates"
     - Sort by Priority DESC, then Created DESC
   - Confirm the resolved list size with the user before Phase 1 starts. A batch of 1-12 Stories is the practical sweet spot; >12 should be split into multiple sessions.

0.5 **Create the session folder + write `plan.md`**:

   ```
   .session/shift-left-testing/<YYYY-MM-DD>-<descriptor>/
     plan.md                # session-management.md §6 schema — Goal, Inputs, Approach,
                            #   Phase breakdown, Risks, Verification checklist, Cross-references.
                            #   Inputs includes TMS modality + candidate list.
     progress.md            # append-only, one entry per phase (§7 schema)
     candidates.md          # Phase 1 output (domain artifact)
     batch-report.md        # Phase 3 final output (domain artifact)
     # Per-Story refinement files live under each Story's own PBI folder,
     # NOT inside the session folder:
     #   .context/PBI/epics/EPIC-<EPIC_KEY>-<slug>/stories/STORY-<STORY_KEY>-<slug>/shift-left-refinement.md
   ```

   The `<descriptor>` is kebab-case (e.g. `morning`, `payments-area`) and lets two sessions on the same day stay independent.

   After this step, append the first entry to `progress.md`: `## Phase 0 — Session Init — <ISO-8601 UTC>` with `status: completed`, `next: Phase 1 — Selection`. Subsequent phases follow the same shape per `agentic-qa-core/references/session-management.md` §7.

---

## Phase 1 — Selection

Decides which Stories actually enter the refinement loop and at what depth.

1. For each candidate ID, detailed-read via `bun run jira:sync-issues get <STORY_KEY> --include-comments` (or batch `bun run jira:sync-issues jql "<backlog JQL>"`) and read the synced `.md` (title, description, ACs, priority, type, labels, sprint, parent epic, comments). NEVER `acli view` — it returns `null` for custom fields. `acli search` is fine for the trivial key+summary+status candidate list only.
2. **Type filter (hard)**: reject anything where `issueType != Story`. Surface the rejected list to the user with a one-line reason. Do NOT silently drop them.
3. **Label filter**: any Story already carrying `shift-left-reviewed` AND a dated label `shift-left-{YYYY-MM-DD}` less than 30 days old is treated as **already refined** — surface it separately under "Already Shift-Left Reviewed (skip or refresh?)". The user decides per-Story whether to skip or re-refine. (Freshness comes from the dated label, never from the issue's `updated` timestamp — any comment or rank change resets `updated`; see `references/backlog-selection.md` §Step 2.)
4. **Triage per accepted candidate** (veto + risk score). Read `references/backlog-selection.md` for the full rubric. Outcomes:
   - **VETO -> SKIP**: pure CSS / docs / static copy / tech-debt with no behavior change -> drop from refinement set, log reason.
   - **REQUIRE FULL**: money / data integrity / auth / external integration / state machine / calculation -> force refinement regardless of score.
   - **Score 0-3 LOW** -> SKIP (PO/Dev can write ACs directly without QA refinement).
   - **Score 4-7 MEDIUM** -> Full refinement (standard).
   - **Score 8+ HIGH** -> Full refinement + extended ambiguity / edge-case scan.
5. **Present the ranked candidate table** (see `references/backlog-selection.md` §Output format) and **WAIT for user OK** before Phase 2. Same pattern as sprint-testing's Story Explanation gate.
6. **Tracking subtask per accepted Story** (after user OK): find-or-create a subtask titled `[QA] Shift-Left Review` under the Story and transition it to In Progress. Resolve the subtask work type + its transitions from `.agents/jira-workflows.json`; if the catalog has no subtask work type (or the project disallows subtasks), log a warning in `progress.md` + the batch report and SKIP — never block the batch. Find-or-create: match the Story's existing subtasks by exact title before creating; an existing one in Done is re-transitioned to In Progress (refresh run). This makes QA's pre-sprint work visible on the board, and the subtask later receives the exhaustive session annotations in Phase 3.

Persist the accepted list into `plan.md` §Inputs so a resumed session reads the same canonical decision. After user OK, append a progress entry: `## Phase 1 — Selection — <ts>` with `status: completed`, `artifacts_touched: [candidates.md, plan.md]`, `next: Phase 2 — Refinement`.

---

## Phase 2 — Refinement (per Story)

For each accepted Story, dispatch ONE Refinement subagent. The subagent loads the existing in-skill reference and applies a shift-left-mode delta.

**Reuse contract**: the subagent reads `.agents/skills/sprint-testing/references/acceptance-test-planning.md` §Phases 1-3 + Phase 4 (outline names only). The delta for shift-left mode:

| acceptance-test-planning.md Phase | Shift-Left adaptation |
|-----------------------------------|----------------------|
| Phase 0 — Triage | Already done in this skill's Phase 1. Skip. |
| Phase 1 — Critical Analysis | Run as-is. Light code exploration only (feasibility check, not reproduction). |
| Phase 2 — Story Quality Analysis | Run as-is. **This is the heart of shift-left** — ambiguities + gaps + edge cases not in story + testability validation. |
| Phase 3 — Refined ACs | Run as-is — Given/When/Then with specific data. Mark inferred scenarios with **NEEDS PO/DEV CONFIRMATION**. |
| Phase 4 — Test Design (outlines) | **OUTLINE NAMES ONLY**. No parametrization tables. No exhaustive per-outline test-data JSON. Coverage estimate (Positive / Negative / Boundary / Integration counts) IS included — it informs PO estimation. |
| Phase 5 — Edge case + Test-data summary | **Edge-case names + criticality only**. No data generation strategy, no Faker recipes — feature does not exist yet. |
| Phase 6 — Traceability + Ticket updates | Phase 3 of THIS skill owns this. Refinement subagent only WRITES the local file; Handoff subagent does Jira mutations. |
| Phase 7 — Final QA Feedback Report | Per-Story summary returned to orchestrator. Aggregated into the batch report in Phase 3. |
| Phase 8 — Commit | **SKIPPED**. Jira is canonical. No git branch, no commit. |

**Staging file**: `.context/PBI/epics/EPIC-<EPIC_KEY>-<slug>/stories/STORY-<STORY_KEY>-<slug>/shift-left-refinement.md` (module = Epic, 1:1). Author it locally; it is NOT a Jira mirror, so the hand-write ban does not apply to it.

**It is a buffer, not a deliverable.** Phase 2 writes it, Phase 3 publishes its full body to the Jira `acceptance_test_plan` field. After that, Jira holds the canonical copy and the synced `acceptance-test-plan.md` is the readable one. The staging file lives under `.context/PBI/**`, which is gitignored, so it exists only on the machine that ran the batch.

Two consequences that are easy to get wrong:

- **Nothing downstream may depend on the staging file being on disk.** `/sprint-testing` Stage 1 short-circuits off the SYNCED `acceptance-test-plan.md`, never off `shift-left-refinement.md` — otherwise the short-circuit silently degrades to a full re-run on any other machine.
- **There is ONE ATP per Story.** This skill authors it early into the `{{jira.acceptance_test_plan}}` field; `/sprint-testing` Stage 1 creates the Test Plan ITEM from that field content and refines the same ATP into the executable superset. No `(Shift-Left DRAFT)` variant, no second Test Plan to reconcile, no pre-sprint Test Plan issue at all.

**Folder bootstrap**: if `.context/PBI/epics/EPIC-<EPIC_KEY>-<slug>/stories/STORY-<STORY_KEY>-<slug>/` does not exist yet (Story has not been through sprint-testing), the refinement subagent creates it. Jira-mirrored content (story.md, acceptance-criteria.md, parent epic, comments) comes from `bun run jira:sync-issues get <STORY_KEY> --include-comments` — NEVER hand-write those files. The only hand-authored files here are the NON-Jira working artifacts (`shift-left-refinement.md`, `context.md` with local session notes). This mirrors `sprint-testing/references/session-entry-points.md` §Step 7. The `evidence/` subfolder is NOT created — there is nothing to capture yet.

**Story Explanation step**: replaced by the per-Story summary the orchestrator presents AFTER the subagent returns. The user OKs (or vetoes) each Story before the next refinement dispatch. This matches the "explain story -> WAIT for OK" rhythm in sprint-testing.

**Progress checkpoint per Story**: after each Refinement subagent returns AND the user OKs the summary, the orchestrator appends a phase entry to `.session/shift-left-testing/<batch-id>/progress.md` per `agentic-qa-core/references/session-management.md` §7: `## Phase 2.<n> — Refine <STORY_KEY> — <ts>` with `status: completed`, `artifacts_touched: [.context/PBI/.../shift-left-refinement.md]`, `next: Phase 2.<n+1> | Phase 3`. This lets a mid-batch resume skip already-refined Stories.

After Phase 2 finishes the full accepted list, the per-Story summaries feed Phase 3.

---

## Phase 3 — Handoff

For each refined Story, dispatch a Handoff subagent. Sequential, one Story at a time, so the user can review the post-handoff Jira state before the next mutation.

### Per-Story handoff sequence

> **Prerequisite**: Phase 0.2 already loaded `/acli`. Pseudocode below uses `[ISSUE_TRACKER_TOOL]` only — this skill creates no TMS items, so `[TMS_TOOL]` never fires pre-sprint.

```
1. Write the refined ACs to the Jira acceptance_criteria field, then append the
   supporting analysis. Jira is source of truth — local Jira-mirrored .md files are
   read-only caches generated by the sync, never hand-written.
     [ISSUE_TRACKER_TOOL] Update Issue:
       issue: {STORY_KEY}
       fields:
         {{jira.acceptance_criteria}}: <refined ACs from Phase 2>
     # FALLBACK (field absent): post as a structured comment headed
     #   "## Acceptance Criteria" per .agents/jira-required.yaml fallback: key. Never block.
   Then append the "QA Refinements (Shift-Left Analysis)" supporting section to the
   Story description:
     - Edge Cases Identified (from Phase 2)
     - Clarified Business Rules (from Phase 2)
     - Open Questions for PO / Dev (from Phase 2)
   After writing, run `bun run jira:sync-issues get {STORY_KEY} --include-comments`
   and read back the synced `acceptance-criteria.md` to confirm the field landed.

2. Populate the ATP — field-first, IDENTICAL in both modalities. ONE ATP per Story,
   authored early: there is no separate DRAFT item and no `(Shift-Left DRAFT)` title.
   Pre-sprint the ATP's home is the `{{jira.acceptance_test_plan}}` custom field;
   the Test Plan ITEM is created by `/sprint-testing` Stage 1 FROM this field content
   once the Story enters the sprint. Full rationale + mutation sequence:
   `references/handoff-protocol.md` Step 2.

     [ISSUE_TRACKER_TOOL] Update Issue:
       issue: {STORY_KEY}
       fields:
         {{jira.acceptance_test_plan}}: <full shift-left-refinement.md body>
     # FALLBACK (field absent on this instance): skip this write — step 3's comment
     #   carries the full body inline per .agents/jira-required.yaml fallback. Never block.

3. Handoff notification on the Story (the ATP lives in {{jira.acceptance_test_plan}} — do NOT mirror it; inline the full body as a `## Acceptance Test Plan (ATP)` comment ONLY if that field is absent — fallback per jira-required.yaml):
     [ISSUE_TRACKER_TOOL] Add Comment:
       issue: {STORY_KEY}
       body: |
         ## Acceptance Test Plan (ATP) — ready for pre-sprint review
         The ATP lives in the {{jira.acceptance_test_plan}} field.
         # FALLBACK ONLY (field absent): replace the pointer line above with the full staged refinement body.

4. Labels:
     [ISSUE_TRACKER_TOOL] Update Issue:
       issue: {STORY_KEY}
       labels: +shift-left-reviewed, +shift-left-{{YYYY-MM-DD}}

5. Set QA Assignee + Transition (Story must be currently in backlog / shift_left_qa / estimation):
     # First QA pickup of the Story — set qa_assignee to the authenticated session
     # user (self), the same moment the QA pulls it into Shift-Left refinement
     # (backlog -> shift_left_qa, the earliest pickup). Read-before-write:
     # set ONLY when empty; NEVER overwrite an existing QA owner except on explicit,
     # justified handover. Per defect-management-doctrine.md Part 2. NOTE: acli
     # `workitem edit` CANNOT set customfields → use REST PUT /rest/api/3/issue/{KEY}
     # with { fields: { {{jira.qa_assignee}}: { accountId } } } (doctrine Part 6).
     [ISSUE_TRACKER_TOOL] Set qa_assignee = <authenticated session user>   # read-before-write; skip if already owned
     # If currently in backlog:
     [ISSUE_TRACKER_TOOL] Transition: {{jira.transition.story.analyze}}      # backlog -> shift_left_qa
     [ISSUE_TRACKER_TOOL] Transition: {{jira.transition.story.estimate}}     # shift_left_qa -> estimation
     # If already in shift_left_qa or estimation, advance only the missing leg.
     # NEVER advance beyond estimation — PO/Dev lead estimates and moves to ready_for_dev.

6. Close the tracking subtask (created in Phase 1; skip with warning if it was skipped there):
     # Exhaustive session annotations (long analysis, refinement traces — anything too
     # verbose for the Story) go on the SUBTASK, keeping the Story clean.
     [ISSUE_TRACKER_TOOL] Add Comment / Update description:
       issue: {SUBTASK_KEY}          # "[QA] Shift-Left Review" under {STORY_KEY}
       body: <exhaustive session annotations>
     [ISSUE_TRACKER_TOOL] Transition: <subtask done transition from .agents/jira-workflows.json>

7. Verify trace (both modalities — field-first, no Test Plan item to trace pre-sprint):
     `bun run jira:sync-issues get {STORY_KEY} --include-comments`,
                  then read back the synced acceptance-test-plan field file + handoff comment;
                  confirm the field is populated and the comment points to it
                  (full body in the comment ONLY in fallback mode — field absent);
                  confirm the subtask (when created) is Done.
```

The Handoff subagent returns a per-Story log: `{story: KEY, atp_container: <field|fallback_comment>, subtask: <done|skipped>, labels_added: [...], transitions: [...], trace_status: ok|warning|fail}`.

### Batch report + Archive

After all Stories handed off, dispatch ONE Batch Report subagent (`Single` pattern) to aggregate:

```
.session/shift-left-testing/<batch-id>/batch-report.md
```

Contents (see `references/handoff-protocol.md` §Batch report template):

- Session metadata (date, mode, candidate count, accepted count, rejected count)
- Per-Story line: ID, title, risk level, # gaps, # critical questions, transition status
- Aggregated top PO/Dev open questions (deduped across Stories)
- Risk distribution chart (LOW / MEDIUM / HIGH counts)
- Blockers (Stories that surfaced data feasibility gaps — flagged for PO before sprint planning)
- Recommended sprint-planning order (by risk + dependency)
- Cross-skill pointer: "When each Story reaches Ready For QA, run `/sprint-testing` — it will short-circuit Phases 1-3 thanks to the `shift-left-reviewed` label."

If all Stories in the batch share a single parent epic, ALSO post the batch report as a comment on that epic. Otherwise, deliver inline to the user as the session-closing message.

After the batch report lands, append the final progress entry `## Phase 3 — Handoff + Batch report — <ts>` with `status: completed`, `next: stop`, then run **Archive** per `agentic-qa-core/references/session-management.md` §8: move `.session/shift-left-testing/<batch-id>/` to `.session/.archive/<YYYY-MM-DD>-shift-left-testing-<batch-id>/` (two-file dir preserved) and call `mem_session_summary` with the session template + archive path.

---

## Gotchas — inline rules to apply every invocation

1. **Credentials always from `.env`.** Never hardcode. Same as sprint-testing.
2. **Stories only.** Bugs / Spikes / Sub-tasks / Tech-debt are rejected in Phase 1. Bugs are reactive — no upstream ACs to refine. If the user really wants to run shift-left on a Tech-debt with behavior changes, ask them to convert it to a Story first.
3. **Veto beats risk score.** Same rule as `acceptance-test-planning.md` §Phase 0. Money / data integrity / auth / external integrations / state machines / calculations -> FORCE Full refinement regardless of score.
4. **Already-reviewed Stories** (label `shift-left-reviewed` <30 days old) are NOT auto-skipped. Surface them and let the user pick: skip / refresh.
5. **Outline names only.** Phase 2 produces outline TITLES + brief preconditions per outline. NO parametrization tables, NO per-outline test-data JSON, NO Faker recipes. Those belong to in-sprint planning (`/sprint-testing`) or Stage 4 (`/test-documentation`).
6. **NEEDS PO/DEV CONFIRMATION**. Any AC or edge case the refinement infers (not literally in the original story) is flagged with this marker. The flag appears verbatim in the Jira description + comment + custom field, so PO sees it during sprint planning.
7. **No execution.** This skill does not run smoke, does not query DBs for data presence, does not run the app. Feasibility is established by READING code + APIs + DB schema only.
8. **Sequential Phase 2.** One refinement subagent at a time, even if the user is impatient. Parallelism would prevent per-Story user OK and break the grooming cadence.
9. **Transition guardrail.** Never advance beyond `{{jira.status.story.estimation}}`. PO/Dev lead owns `estimate -> ready_for_dev`. If a Story is already past `estimation` when the session starts, log a warning and SKIP the transition step — refinement still lands on Jira, but the workflow stays untouched.
10. **Label hygiene.** Always add BOTH `shift-left-reviewed` AND `shift-left-{{YYYY-MM-DD}}`. The dated label lets `/sprint-testing` decide whether the refinement is still fresh (<30 days) and short-circuit, or whether to redo Phases 1-3.
11. **Jira is canonical.** No git commit, no test branch. Local `shift-left-refinement.md` is a working artifact — gitignored under `.context/PBI/**`. The populated `{{jira.acceptance_test_plan}}` field (or its `## Acceptance Test Plan (ATP)` fallback comment when the field is absent) is the contract `fix-traceability` checks later.
12. **Language**: artifacts + Jira content always English. Mirror the user's language only in conversation (per AGENTS.md §1 Rule #14).
13. **Session-footer contract (mandatory at close).** The final phase is not done until the two chat-facing blocks from `../agentic-qa-core/references/session-footer-contract.md` are printed: (1) consolidated screenshot list — repo-relative paths, verified on disk, bug annotations first — plus in-flow surfacing of every capture's path the instant it lands; (2) Session Footer listing skills/MCPs/CLIs actually used + testing levels touched, with explicit "none" entries for expected-but-untouched levels. Framing for this skill: execution. Multi-subagent sessions: each stage report carries the five footer fields (`skills_loaded`, `mcps_used`, `clis_used`, `testing_levels_touched`, `screenshots_captured`); the orchestrator compiles the footer ONCE at close. Chat only — never in a Jira comment or ATR body.
14. **Subtask tracking is best-effort.** The `[QA] Shift-Left Review` subtask makes QA's pre-sprint work visible on the board and holds the exhaustive session annotations that would otherwise clutter the Story. If `.agents/jira-workflows.json` has no subtask work type (or the project disallows subtasks), warn once in the batch report and proceed — never block a refinement on subtask support.

---

## Anti-patterns — NEVER do these

**L1.** NEVER force ambiguity questions onto a Story to fill a checklist — raise PO/Dev questions ONLY when a genuine gap, ambiguity, or untestable AC exists. Per AGENTS.md §1 Rule #4: shift-left adds value by surfacing real risk, not by inflating question counts. A clean Story exits with an empty question list and that is a valid outcome.

**L2.** NEVER skip the `shift-left-reviewed` label when transitioning a Story out of Phase 3. `/sprint-testing` Phase 0 inspects that label to short-circuit Phases 1-3 of in-sprint planning; missing the label forces redundant work later and breaks the cadence this skill exists to enable.

**L3.** NEVER mix Story refinement with bug retest in the same batch. `/shift-left-testing` accepts Stories only (Phase 1 type filter is a hard reject). Bugs are reactive — they have no upstream ACs to refine and belong to `/sprint-testing` instead.

**L4.** NEVER hand-write the ATP body as raw ADF JSON. Author the body in Markdown locally (`shift-left-refinement.md`) and let `[ISSUE_TRACKER_TOOL]` convert via its md-to-ADF path on update. Hand-rolled ADF drifts from the field content that `fix-traceability` later validates.

**L5.** NEVER transition a Story to `estimation` without a populated ATP (the `{{jira.acceptance_test_plan}}` custom field in BOTH modalities; the `## Acceptance Test Plan (ATP)` fallback comment when the field is absent). The pre-sprint ATP is what makes the Story estimable — without it, Dev and PO guess scope and the shift-left effort delivers no signal.

**L8.** NEVER create the Test Plan item pre-sprint. The pre-sprint ATP's only home is the `{{jira.acceptance_test_plan}}` field (or its fallback comment); `/sprint-testing` Stage 1 creates the Test Plan issue FROM that field content once the Story enters the sprint. A pre-sprint item wastes an artifact on a Story whose scope may still shrink and creates a second copy Stage 1 must reconcile.

**L6.** NEVER refine more than ~10-12 Stories in a single batch. Refinement quality degrades past that — user attention budget collapses, summaries blur, the batch report loses signal. Split larger groomings into multiple sessions with distinct `<descriptor>` values.

**L7.** NEVER add a PO/Dev question that the AC body already answers in plain text. The reader's bandwidth is the scarcest resource in a grooming session; redundant questions train the team to skim future shift-left output.

---

## Cross-skill handoff — what this skill does NOT do

| After Phase 3 you need... | Load this skill / command | Reason |
|---------------------------|---------------------------|--------|
| Wait for Dev to estimate + commit the Story into a sprint | (manual / PO) | This skill stops at `{{jira.status.story.estimation}}`. PO + Dev lead drive `estimate -> ready_for_dev` and sprint commitment. |
| In-sprint manual QA once the Story reaches `Ready For QA` | `/sprint-testing` | Will detect label `shift-left-reviewed`, validate the refinement is still fresh, short-circuit Phases 1-3, and run Phases 4-8 + Stages 2 + 3 normally. Stage 1 also creates the Test Plan ITEM from the `{{jira.acceptance_test_plan}}` field this skill populated. |
| Formal TC creation + ROI scoring after Story ships | `/test-documentation` | Stage 4 turns the outlines + refined ACs into formal Xray TCs (Modality jira-xray) or Jira Test issues (Modality jira-native) with ROI scoring. |
| Automated test code | `/test-automation` | Stage 5. |
| Regression suite execution | `/regression-testing` | Stage 6. |
| Generate / refresh business + master test plan context | `/project-discovery` + `/business-*-map` + `/master-test-plan` | This skill consumes those; it does not create them. |
| Adversarial dual-review of the refinement (optional) | `/judgment-day` | Useful when shift-left output goes to a high-risk Story. Not auto-invoked. |

If Phase 0.3 reports any project-wide context file missing, STOP and hand off — refinement without business context produces vague PO questions and dilutes the batch report.

---

## Pseudocode tags used here

| Tag | Resolves to | Defined in |
|-----|-------------|------------|
| `[ISSUE_TRACKER_TOOL]` | `acli`, Atlassian MCP, or `{{ISSUE_TRACKER_CLI}}` | `AGENTS.md` Tool Resolution |
| `[TMS_TOOL]` | xray-cli skill (Modality jira-xray) OR `acli` (Modality jira-native) | `AGENTS.md` Tool Resolution |

> **Reads vs writes split** (per `agentic-qa-core/references/acli-integration.md` §"Reads vs writes"): detailed reads (description, ACs, scope, comments, parent epic) → `bun run jira:sync-issues get/jql`, then read the synced `.md`. Writes (custom-field update, comment, transition, label, link) + the trivial key+summary+status candidate list → `acli`. NEVER `acli view` for a custom field.
| `[DB_TOOL]` | DBHub MCP or Supabase MCP | `AGENTS.md` Tool Resolution |
| `[API_TOOL]` | OpenAPI MCP, Postman, or curl | `AGENTS.md` Tool Resolution |

Concrete tools (`bun`, `git`, `gh`) used literally. Project variables resolve from `.agents/project.yaml` (env-scoped vars resolve to the active environment). Jira variables (`{{jira.status.story.*}}`, `{{jira.transition.story.*}}`, `{{jira.acceptance_test_plan}}`) resolve from `.agents/jira-workflows.json` + `.agents/jira-fields.json`.

---

## References — read the narrow one for the situation

All references are self-contained. Load one at a time.

| Reference | Read when |
|-----------|-----------|
| `references/backlog-selection.md` | Phase 0.4 + Phase 1 — building the candidate JQL, applying veto + risk-score triage per candidate, formatting the candidate table for user approval. |
| `references/refinement-playbook.md` | Phase 2 — running the per-Story refinement subagent. Cites `acceptance-test-planning.md` Phases 1-3 + outline-only Phase 4. Documents the shift-left deltas (no parametrization, no test-data gen, outline names only). |
| `references/atp-outline-template.md` | Phase 2 — body skeleton for `shift-left-refinement.md` (the pre-sprint ATP at outline maturity). Different from sprint-testing's full ATP body. |
| `references/refinement-questions.md` | Phase 2 — catalog of typical PO / Dev / Design gap-spotting questions, grouped by AC archetype (auth, money, search, state machine, etc.). Use as a checklist when the Story is sparse. |
| `references/handoff-protocol.md` | Phase 3 — exact Jira mutation sequence per Story (field-first ATP write, subtask close), label + transition rules, batch report template + epic-comment posting rules. |
| `../agentic-qa-core/references/session-management.md` | Phase 0 + Phase 4 — resume contract, plan.md/progress.md schemas, archive policy, Engram per-phase checkpoint. This skill is a producer of `session/shift-left-testing/<batch-id>/...` topic keys. |

---

## Pre-flight checklist

- [ ] Session resume check ran (Phase 0.0); user chose resume / restart / abort if prior state existed
- [ ] TMS modality resolved + persisted to `plan.md` §Inputs
- [ ] `/acli` loaded (no `/xray-cli` — this skill creates no TMS items)
- [ ] Project-wide context files present (else handed off to `/project-discovery`)
- [ ] Candidate Story list resolved (explicit IDs or backlog JQL) + confirmed with user
- [ ] Session folder `.session/shift-left-testing/<YYYY-MM-DD>-<descriptor>/` created with `plan.md` written
- [ ] Phase 1 produced the ranked candidate table, user OK'd the refinement set
- [ ] Phase 1 found-or-created the `[QA] Shift-Left Review` subtask per accepted Story → In Progress (or skipped with warning — no subtask work type)
- [ ] Phase 2 ran ONE refinement subagent per accepted Story, user OK'd each summary
- [ ] Per-Story `shift-left-refinement.md` written under each Story's PBI folder
- [ ] Phase 3 handoff applied per Story: Jira description + ATP field (`{{jira.acceptance_test_plan}}`, both modalities) + handoff comment + labels + transition (stops at `estimation`) — NO Test Plan item created
- [ ] Subtask closed per Story: session annotations posted on it + transitioned to Done (or skipped with warning)
- [ ] Trace verified per Story (both modalities: field populated + pointer comment; full body in comment only in fallback mode)
- [ ] Batch report written + posted to parent epic (if applicable)
- [ ] Archive: `.session/shift-left-testing/<batch-id>/` moved to `.session/.archive/<YYYY-MM-DD>-shift-left-testing-<batch-id>/` and `mem_session_summary` called
- [ ] No git commit (Jira is canonical for this skill)
- [ ] User informed: when each Story reaches `Ready For QA`, run `/sprint-testing` (will short-circuit thanks to `shift-left-reviewed`)
- [ ] Session footer + consolidated screenshot list printed in chat per session-footer-contract (never in a Jira comment)
