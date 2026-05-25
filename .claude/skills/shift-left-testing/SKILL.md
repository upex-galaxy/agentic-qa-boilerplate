---
name: shift-left-testing
description: "Orchestrates pre-sprint Shift-Left QA on a batch of backlog Stories. Use when the user wants to refine acceptance criteria, surface ambiguities + gaps, draft an ATP outline, and hand off to PO/Dev BEFORE the Story enters a sprint — so defects are prevented in the requirements, not detected after implementation. Triggers on: shift-left testing, shift-left these stories, groom the backlog, pre-sprint QA, refine these N stories, pre-sprint refinement batch, prepare backlog for sprint planning, run AC refinement on UPEX-100/101/102, run shift-left QA, do early-game testing, pre-sprint test planning. ALSO trigger when the user pastes a comma-separated list of Story IDs sitting in Backlog / Shift-Left QA / Estimation / Ready For Dev and asks any variant of \"refine\", \"groom\", \"clean these ACs\", \"shift-left these\". Do NOT use for: in-sprint manual QA per ticket (use /sprint-testing — entry status is Ready For QA, this skill's entry status is Backlog/Shift-Left QA), Stage 4 TMS documentation + ROI (test-documentation), Stage 5 automation code (test-automation), Stage 6 regression suite execution (regression-testing), bugs (this skill only accepts Stories — bugs are reactive and have no upstream ACs to refine), epic-level test strategy (use feature-test-planning inside /sprint-testing for that)."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
complementary_categories: [testing-e2e, issue-tracker, tms]
---

## Inputs

Read in order; stop earlier when the batch is small enough that later inputs add no signal.

1. `.context/business/business-feature-map.md` + `.context/business/business-data-map.md` — domain vocabulary, entity model, CRUD matrix. Anchors refined ACs in real entities and flows.
2. `.context/master-test-plan.md` — regression Epic + in-scope modules. Tells the refinement whether the Story falls inside an already-prioritized area.
3. The Story's Acceptance Criteria + `**Source spec:**` reference on Jira (fetched via `[ISSUE_TRACKER_TOOL]`). Canonical input — every refined AC must trace back here.
4. `.context/PBI/{module-name}/{TICKET-ID}-*/` if a PBI folder already exists for this Story (created by a prior `/sprint-testing` cycle). Carries earlier session notes worth honoring.
5. `.agents/jira-workflows.json` — Story workflow + valid transitions (`backlog -> shift_left_qa -> estimation`). Source of `{{jira.transition.story.*}}` slugs used in Phase 3.
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
`.claude/skills/agentic-qa-core/references/skill-composition-strategy.md` §4
(governs users who manually install SDD).

# Shift-Left Testing — Pre-Sprint AC Refinement on a Backlog Batch

Drive Stage 0 — the pre-sprint Shift-Left loop — on a set of backlog Stories. Three phases, always in this order: **Phase 1 Selection -> Phase 2 Refinement -> Phase 3 Handoff**. Hand off afterwards to `/sprint-testing` once each Story reaches `Ready For QA`.

The skill is **batch-by-design**: one session refines N Stories from the backlog so PO + Dev lead can run a single grooming pass with the team. There is no single-ticket mode — for a one-off urgent refinement, pass a list of length 1; the cadence stays the same.

---

## Why this skill exists (separation from `/sprint-testing`)

| Eje | `/sprint-testing` | `/shift-left-testing` |
|-----|-------------------|----------------------|
| Cadence | In-sprint, ticket-by-ticket loop | Pre-sprint, batch grooming of N Stories |
| Entry status | `{{jira.status.story.ready_for_qa}}` | `{{jira.status.story.backlog}}` / `shift_left_qa` / `estimation` / `ready_for_dev` |
| Exit status | `{{jira.status.story.qa_approved}}` (full execution) | `{{jira.status.story.estimation}}` (refined, awaiting estimate by PO + Dev) |
| Audience | Dev + tester | PO / BA + tester (Dev lead optional) |
| Output | ATP + ATR + bugs + execution evidence | Refined ACs + risk map + ATP DRAFT (outlines only) + batch report |
| Execution | Smoke + UI / API / DB exploration | NONE — feature does not exist yet |
| Code reads | Deep, targeted (reproduce / verify) | Light (feasibility only — does the codebase support this?) |
| TC creation | Yes (TCs created in Stage 1) | No — Stage 4 (`test-documentation`) creates TCs after the Story ships |
| Sprint-testing later | Runs full pipeline | Short-circuits Phases 1-3 (label `shift-left-reviewed` detected) and just validates |

The reuse story is **deliberate**: ~70% of the refinement logic already lives in `sprint-testing/references/acceptance-test-planning.md` Phases 1-3. This skill cites that reference instead of duplicating it — see Phase 2 below.

---

## Subagent Dispatch Strategy

> **Orchestration & Session contracts**: this skill follows `./orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `./session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 1 (plan write) are NOT optional.

This skill is **per-batch scope**: `<scope>` = `<YYYY-MM-DD>-<descriptor>` (e.g. `2026-05-20-payments-area`). Session state lives at `.session/shift-left-testing/<YYYY-MM-DD>-<descriptor>/{plan.md, progress.md}` per `agentic-qa-core/references/session-management.md` §3 + §9. The per-Story `shift-left-refinement.md` files stay under each Story's PBI folder (domain artifact, not session state).

This skill is compliant with the doctrine in `CLAUDE.md` §"Orchestration Mode (Subagent Strategy)" and the session contract in `.claude/skills/agentic-qa-core/references/session-management.md`. Every dispatch follows the 7-component briefing format defined in `.claude/skills/agentic-qa-core/references/briefing-template.md`, and the pattern selected per phase matches the decision guide in `.claude/skills/agentic-qa-core/references/dispatch-patterns.md`.

| Phase | Pattern | Subagent role |
|-------|---------|---------------|
| Phase 1 — Selection | Single | Backlog Selection subagent: pull candidate Stories via `[ISSUE_TRACKER_TOOL]`, apply veto + risk-score triage, return ranked candidate table |
| Phase 2 — Refinement (per Story) | Sequential — looped per Story | Refinement subagent: load `acceptance-test-planning.md` Phases 1-3 + outline-only Phase 4, write `shift-left-refinement.md`, append PO/Dev questions, return summary block. ONE subagent per Story. NEVER parallel across Stories (each subagent writes a different PBI file but the orchestrator must present each summary to the user sequentially before the next dispatch) |
| Phase 3 — Handoff (per Story) | Sequential — looped per Story | Handoff subagent: update Jira description + custom field (or Test Plan in Modality jira-xray) + comment mirror + labels + transition `backlog -> shift_left_qa -> estimation`. Returns transition log + trace verification |
| Phase 3 — Batch report | Single | Batch Report subagent: aggregate per-Story summaries into `.session/shift-left-testing/<batch-id>/batch-report.md` + post to parent epic if Stories share one |

> **Sequential by design**. Phase 2 refinement looks parallelizable (each Story is independent in Jira), but the orchestrator must present each Story's refinement summary to the user before moving on. This keeps the user in the loop, lets them veto a Story mid-batch, and matches the team-grooming cadence the skill is designed for. Parallelism would burn the user's attention budget.

> **On any subagent failure**: STOP, report the partial state (which Stories refined, which Jira mutations landed), present retry / skip-story / abort options. Do NOT auto-fix nor auto-rollback. Jira mutations are recorded in the batch report so partial sessions are resumable. See `.claude/skills/agentic-qa-core/references/orchestration-doctrine.md`.

---

## Workflow — one pipeline, three phases

```
Phase 0 — Session resume check + Session Init (always first)
    -> Check .session/shift-left-testing/<batch-id>/progress.md → offer resume / restart / abort
    -> Resolve TMS modality (A: Xray / B: Jira-native)
    -> Load /acli (+ /xray-cli if Modality jira-xray and user opts into Test Plan link)
    -> Verify project-wide context files
    -> Resolve candidate list (explicit IDs OR backlog JQL)
    -> Create session folder .session/shift-left-testing/<YYYY-MM-DD>-<descriptor>/
       (writes plan.md after candidate list confirmed; progress.md appended per phase)

Phase 1 — Selection
    -> Fetch each candidate via [ISSUE_TRACKER_TOOL]
    -> Reject non-Story types (Bug / Spike / Sub-task / Tech-debt)
    -> Apply veto + risk-score triage per candidate
    -> Present ranked candidate table -> WAIT for user OK

Phase 2 — Refinement (loop per accepted Story)
    -> Dispatch Refinement subagent: produce shift-left-refinement.md
       (Critical Analysis + Story Quality Analysis + Refined ACs + ATP DRAFT outlines)
    -> Reuses sprint-testing/references/acceptance-test-planning.md §Phases 1-3
       with shift-left-mode delta (no test-data generation, no parametrization tables, outline names only)
    -> Present per-Story summary -> WAIT for user OK before next Story

Phase 3 — Handoff
    -> Per Story sequentially:
         - Update Jira description with "QA Refinements (Shift-Left Analysis)"
         - Populate ATP DRAFT (Modality jira-native: custom field + comment mirror;
                              Modality jira-xray: Test Plan issue + link, optional)
         - Labels: shift-left-reviewed + shift-left-{YYYY-MM-DD}
         - Transition: backlog -> shift_left_qa (analyze) -> estimation (estimate)
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
```

---

## Phase 0 — Session resume check + Session Init

0.0 **Session resume check** (per `agentic-qa-core/references/session-management.md` §4). Compute `<batch-id>` = `<YYYY-MM-DD>-<descriptor>` from the invocation context. Check `.session/shift-left-testing/<batch-id>/progress.md`. If it exists, read `plan.md` + the tail of `progress.md`, surface the last completed phase + next planned phase + any blocking notes, and offer **resume / restart / abort**. On `restart`, archive the current directory to `.session/.archive/<YYYY-MM-DD>-shift-left-testing-<batch-id>-aborted/` before proceeding. On `abort`, stop here.

0.1 **Resolve TMS modality**. Same 4-step probe as `sprint-testing` Session Start (`test-documentation/SKILL.md` §Phase 0). Persist the result in `.session/shift-left-testing/<batch-id>/plan.md` (under the `## Inputs` H2 — the plan.md is the canonical record per session-management §6).

0.2 **Load required tool skills** — based on modality:
   - Always load `/acli` (Story fetch, custom-field update, comment, transition, label, link).
   - **Modality jira-xray** AND user opts into Test Plan link draft for each Story -> also load `/xray-cli`. The default in shift-left is NO Test Plan creation (PO has not estimated yet, scope may shrink) — the ATP DRAFT lives on the Story description + comment + custom field. Ask the user before creating Test Plan issues.
   - **Modality jira-native** -> `/acli` alone covers `[ISSUE_TRACKER_TOOL]` and `[TMS_TOOL]`.

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
     #   .context/PBI/{module-name}/{{PROJECT_KEY}}-{n}-{brief-title}/shift-left-refinement.md
   ```

   The `<descriptor>` is kebab-case (e.g. `morning`, `payments-area`) and lets two sessions on the same day stay independent.

   After this step, append the first entry to `progress.md`: `## Phase 0 — Session Init — <ISO-8601 UTC>` with `status: completed`, `next: Phase 1 — Selection`. Subsequent phases follow the same shape per `agentic-qa-core/references/session-management.md` §7.

---

## Phase 1 — Selection

Decides which Stories actually enter the refinement loop and at what depth.

1. For each candidate ID, fetch via `[ISSUE_TRACKER_TOOL]` (title, description, ACs, priority, type, labels, sprint, parent epic, comments).
2. **Type filter (hard)**: reject anything where `issueType != Story`. Surface the rejected list to the user with a one-line reason. Do NOT silently drop them.
3. **Label filter**: any Story already carrying `shift-left-reviewed` AND last-updated < 30 days ago is treated as **already refined** — surface it separately under "Already Shift-Left Reviewed (skip or refresh?)". The user decides per-Story whether to skip or re-refine.
4. **Triage per accepted candidate** (veto + risk score). Read `references/backlog-selection.md` for the full rubric. Outcomes:
   - **VETO -> SKIP**: pure CSS / docs / static copy / tech-debt with no behavior change -> drop from refinement set, log reason.
   - **REQUIRE FULL**: money / data integrity / auth / external integration / state machine / calculation -> force refinement regardless of score.
   - **Score 0-3 LOW** -> SKIP (PO/Dev can write ACs directly without QA refinement).
   - **Score 4-7 MEDIUM** -> Full refinement (standard).
   - **Score 8+ HIGH** -> Full refinement + extended ambiguity / edge-case scan.
5. **Present the ranked candidate table** (see `references/backlog-selection.md` §Output format) and **WAIT for user OK** before Phase 2. Same pattern as sprint-testing's Story Explanation gate.

Persist the accepted list into `plan.md` §Inputs so a resumed session reads the same canonical decision. After user OK, append a progress entry: `## Phase 1 — Selection — <ts>` with `status: completed`, `artifacts_touched: [candidates.md, plan.md]`, `next: Phase 2 — Refinement`.

---

## Phase 2 — Refinement (per Story)

For each accepted Story, dispatch ONE Refinement subagent. The subagent loads the existing in-skill reference and applies a shift-left-mode delta.

**Reuse contract**: the subagent reads `.claude/skills/sprint-testing/references/acceptance-test-planning.md` §Phases 1-3 + Phase 4 (outline names only). The delta for shift-left mode:

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

**Output file**: `.context/PBI/{module-name}/{{PROJECT_KEY}}-{n}-{brief-title}/shift-left-refinement.md`

This is a **separate file** from sprint-testing's `test-analysis.md`. Both can co-exist for the same Story:

- `shift-left-refinement.md` — written here, pre-sprint, by this skill.
- `test-analysis.md` — written later, in-sprint, by `/sprint-testing` Stage 1. When that file is created, sprint-testing reads `shift-left-refinement.md` as input and short-circuits the redundant phases.

**Folder bootstrap**: if `.context/PBI/{module-name}/{{PROJECT_KEY}}-{n}-{brief-title}/` does not exist yet (Story has not been through sprint-testing), the refinement subagent creates it along with a minimal `context.md` (title + ACs + status + parent epic + Team Discussion if comments exist). This mirrors `sprint-testing/references/session-entry-points.md` §Step 7. The `evidence/` subfolder is NOT created — there is nothing to capture yet.

**Story Explanation step**: replaced by the per-Story summary the orchestrator presents AFTER the subagent returns. The user OKs (or vetoes) each Story before the next refinement dispatch. This matches the "explain story -> WAIT for OK" rhythm in sprint-testing.

**Progress checkpoint per Story**: after each Refinement subagent returns AND the user OKs the summary, the orchestrator appends a phase entry to `.session/shift-left-testing/<batch-id>/progress.md` per `agentic-qa-core/references/session-management.md` §7: `## Phase 2.<n> — Refine <STORY_KEY> — <ts>` with `status: completed`, `artifacts_touched: [.context/PBI/.../shift-left-refinement.md]`, `next: Phase 2.<n+1> | Phase 3`. This lets a mid-batch resume skip already-refined Stories.

After Phase 2 finishes the full accepted list, the per-Story summaries feed Phase 3.

---

## Phase 3 — Handoff

For each refined Story, dispatch a Handoff subagent. Sequential, one Story at a time, so the user can review the post-handoff Jira state before the next mutation.

### Per-Story handoff sequence

> **Prerequisite**: Phase 0.2 already loaded `/acli` (and `/xray-cli` in Modality jira-xray if Test Plan creation is opted in). Pseudocode below uses `[ISSUE_TRACKER_TOOL]` and `[TMS_TOOL]`.

```
1. Append "QA Refinements (Shift-Left Analysis)" section to Story description.
   Body:
     - Refined Acceptance Criteria (from Phase 2)
     - Edge Cases Identified (from Phase 2)
     - Clarified Business Rules (from Phase 2)
     - Open Questions for PO / Dev (from Phase 2)

2. Populate ATP DRAFT — branch on modality:

   Modality jira-xray — Xray (Test Plan creation opted in)
     [TMS_TOOL] Create TestPlan:
       project: {{PROJECT_KEY}}
       title: "Test Plan (Shift-Left DRAFT): {{PROJECT_KEY}}-{n}"
     [ISSUE_TRACKER_TOOL] Link Issues:
       linkType: "tests"
       outward: {ATP_KEY}
       inward:  {STORY_KEY}
     [ISSUE_TRACKER_TOOL] Update Issue:
       issue: {ATP_KEY}
       description: <full shift-left-refinement.md body>

   Modality jira-xray — Xray (Test Plan creation NOT opted in, default)
     OR Modality jira-native:
     [ISSUE_TRACKER_TOOL] Update Issue:
       issue: {STORY_KEY}
       fields:
         {{jira.acceptance_test_plan}}: <full shift-left-refinement.md body>

3. Post the canonical comment mirror on the Story:
     [ISSUE_TRACKER_TOOL] Add Comment:
       issue: {STORY_KEY}
       body: |
         === Shift-Left Refinement: {{PROJECT_KEY}}-{n} ===
         <full shift-left-refinement.md body — byte-for-byte mirror>

4. Labels:
     [ISSUE_TRACKER_TOOL] Update Issue:
       issue: {STORY_KEY}
       labels: +shift-left-reviewed, +shift-left-{{YYYY-MM-DD}}

5. Transition (Story must be currently in backlog / shift_left_qa / estimation):
     # If currently in backlog:
     [ISSUE_TRACKER_TOOL] Transition: {{jira.transition.story.analyze}}      # backlog -> shift_left_qa
     [ISSUE_TRACKER_TOOL] Transition: {{jira.transition.story.estimate}}     # shift_left_qa -> estimation
     # If already in shift_left_qa or estimation, advance only the missing leg.
     # NEVER advance beyond estimation — PO/Dev lead estimates and moves to ready_for_dev.

6. Verify trace:
     Modality jira-xray: [TMS_TOOL] trace {STORY_KEY}    (Test Plan link present + populated)
     Modality jira-native: read back {{jira.acceptance_test_plan}} + last comment;
                  confirm byte-for-byte mirror.
```

The Handoff subagent returns a per-Story log: `{story: KEY, atp_container: <field|test_plan>, labels_added: [...], transitions: [...], trace_status: ok|warning|fail}`.

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
11. **Jira is canonical.** No git commit, no test branch. Local `shift-left-refinement.md` is a working artifact — gitignored under `.context/PBI/**`. The byte-for-byte mirror between Jira custom field + comment + local file is the contract `fix-traceability` checks later.
12. **Language**: artifacts + Jira content always English. Mirror the user's language only in conversation (per CLAUDE.md §1 Rule #14).

---

## Anti-patterns — NEVER do these

**L1.** NEVER force ambiguity questions onto a Story to fill a checklist — raise PO/Dev questions ONLY when a genuine gap, ambiguity, or untestable AC exists. Per CLAUDE.md §1 Rule #4: shift-left adds value by surfacing real risk, not by inflating question counts. A clean Story exits with an empty question list and that is a valid outcome.

**L2.** NEVER skip the `shift-left-reviewed` label when transitioning a Story out of Phase 3. `/sprint-testing` Phase 0 inspects that label to short-circuit Phases 1-3 of in-sprint planning; missing the label forces redundant work later and breaks the cadence this skill exists to enable.

**L3.** NEVER mix Story refinement with bug retest in the same batch. `/shift-left-testing` accepts Stories only (Phase 1 type filter is a hard reject). Bugs are reactive — they have no upstream ACs to refine and belong to `/sprint-testing` instead.

**L4.** NEVER hand-write the ATP DRAFT body as raw ADF JSON. Author the body in Markdown locally (`shift-left-refinement.md`) and let `[ISSUE_TRACKER_TOOL]` convert via its md-to-ADF path on update. Hand-rolled ADF drifts from the byte-for-byte mirror that `fix-traceability` later validates.

**L5.** NEVER transition a Story to `estimation` without a populated ATP DRAFT (custom field in Modality jira-native; Test Plan link in Modality jira-xray when opted in). The DRAFT is what makes the Story estimable — without it, Dev and PO guess scope and the shift-left effort delivers no signal.

**L6.** NEVER refine more than ~10-12 Stories in a single batch. Refinement quality degrades past that — user attention budget collapses, summaries blur, the batch report loses signal. Split larger groomings into multiple sessions with distinct `<descriptor>` values.

**L7.** NEVER add a PO/Dev question that the AC body already answers in plain text. The reader's bandwidth is the scarcest resource in a grooming session; redundant questions train the team to skim future shift-left output.

---

## Cross-skill handoff — what this skill does NOT do

| After Phase 3 you need... | Load this skill / command | Reason |
|---------------------------|---------------------------|--------|
| Wait for Dev to estimate + commit the Story into a sprint | (manual / PO) | This skill stops at `{{jira.status.story.estimation}}`. PO + Dev lead drive `estimate -> ready_for_dev` and sprint commitment. |
| In-sprint manual QA once the Story reaches `Ready For QA` | `/sprint-testing` | Will detect label `shift-left-reviewed`, validate the refinement is still fresh, short-circuit Phases 1-3, and run Phases 4-8 + Stages 2 + 3 normally. |
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
| `[ISSUE_TRACKER_TOOL]` | `acli`, Atlassian MCP, or `{{ISSUE_TRACKER_CLI}}` | `CLAUDE.md` Tool Resolution |
| `[TMS_TOOL]` | xray-cli skill (Modality jira-xray) OR `acli` (Modality jira-native) | `CLAUDE.md` Tool Resolution |
| `[DB_TOOL]` | DBHub MCP or Supabase MCP | `CLAUDE.md` Tool Resolution |
| `[API_TOOL]` | OpenAPI MCP, Postman, or curl | `CLAUDE.md` Tool Resolution |

Concrete tools (`bun`, `git`, `gh`) used literally. Project variables resolve from `.agents/project.yaml` (env-scoped vars resolve to the active environment). Jira variables (`{{jira.status.story.*}}`, `{{jira.transition.story.*}}`, `{{jira.acceptance_test_plan}}`) resolve from `.agents/jira-workflows.json` + `.agents/jira-fields.json`.

---

## References — read the narrow one for the situation

All references are self-contained. Load one at a time.

| Reference | Read when |
|-----------|-----------|
| `references/backlog-selection.md` | Phase 0.4 + Phase 1 — building the candidate JQL, applying veto + risk-score triage per candidate, formatting the candidate table for user approval. |
| `references/refinement-playbook.md` | Phase 2 — running the per-Story refinement subagent. Cites `acceptance-test-planning.md` Phases 1-3 + outline-only Phase 4. Documents the shift-left deltas (no parametrization, no test-data gen, outline names only). |
| `references/atp-draft-template.md` | Phase 2 — body skeleton for `shift-left-refinement.md` (the ATP DRAFT). Different from sprint-testing's full ATP body. |
| `references/refinement-questions.md` | Phase 2 — catalog of typical PO / Dev / Design gap-spotting questions, grouped by AC archetype (auth, money, search, state machine, etc.). Use as a checklist when the Story is sparse. |
| `references/handoff-protocol.md` | Phase 3 — exact Jira mutation sequence per Story, label + transition rules, batch report template + epic-comment posting rules. |
| `../agentic-qa-core/references/session-management.md` | Phase 0 + Phase 4 — resume contract, plan.md/progress.md schemas, archive policy, Engram per-phase checkpoint. This skill is a producer of `session/shift-left-testing/<batch-id>/...` topic keys. |

---

## Pre-flight checklist

- [ ] Session resume check ran (Phase 0.0); user chose resume / restart / abort if prior state existed
- [ ] TMS modality resolved + persisted to `plan.md` §Inputs
- [ ] `/acli` (+ `/xray-cli` if Modality jira-xray with Test Plan opt-in) loaded
- [ ] Project-wide context files present (else handed off to `/project-discovery`)
- [ ] Candidate Story list resolved (explicit IDs or backlog JQL) + confirmed with user
- [ ] Session folder `.session/shift-left-testing/<YYYY-MM-DD>-<descriptor>/` created with `plan.md` written
- [ ] Phase 1 produced the ranked candidate table, user OK'd the refinement set
- [ ] Phase 2 ran ONE refinement subagent per accepted Story, user OK'd each summary
- [ ] Per-Story `shift-left-refinement.md` written under each Story's PBI folder
- [ ] Phase 3 handoff applied per Story: Jira description + ATP DRAFT field + comment mirror + labels + transition (stops at `estimation`)
- [ ] Trace verified per Story (Modality jira-xray: Test Plan link; Modality jira-native: field+comment mirror)
- [ ] Batch report written + posted to parent epic (if applicable)
- [ ] Archive: `.session/shift-left-testing/<batch-id>/` moved to `.session/.archive/<YYYY-MM-DD>-shift-left-testing-<batch-id>/` and `mem_session_summary` called
- [ ] No git commit (Jira is canonical for this skill)
- [ ] User informed: when each Story reaches `Ready For QA`, run `/sprint-testing` (will short-circuit thanks to `shift-left-reviewed`)
