# Refinement Playbook — Phase 2 (Per-Story Subagent)

> **Subagent context**: this file is the primary "Context docs" reference for the Phase 2 Refinement subagent (see `shift-left-testing/SKILL.md` §Subagent Dispatch Strategy). It is a thin wrapper that CITES `sprint-testing/references/acceptance-test-planning.md` rather than duplicating it.

The Refinement subagent runs ONCE PER STORY. It reads the existing acceptance-test-planning playbook from sprint-testing, applies the shift-left-mode delta, and writes a single output file: `shift-left-refinement.md` inside the Story's PBI folder.

This reference defines the delta only. Anything not overridden here behaves exactly as in `acceptance-test-planning.md`.

---

## Reuse contract

```
Source of truth (cited, not duplicated):
  .claude/skills/sprint-testing/references/acceptance-test-planning.md

Phases run by the Refinement subagent:
  Phase 1  Critical Analysis        -> run as-is, light code reads only
  Phase 2  Story Quality Analysis   -> run as-is (this is the heart of shift-left)
  Phase 3  Refined ACs              -> run as-is (Given/When/Then with data)
  Phase 4  Test Design (outlines)   -> outline NAMES + brief preconditions only
  Phase 5  Edge case summary        -> edge-case NAMES + criticality only

Phases skipped:
  Phase 0  Triage                   -> already done in shift-left-testing Phase 1
  Phase 4  parametrization tables   -> deferred to in-sprint
  Phase 4  per-outline test-data JSON -> deferred to in-sprint
  Phase 5  test-data generation strategy -> deferred to in-sprint
  Phase 6  Traceability + Ticket updates -> shift-left-testing Phase 3 owns this
  Phase 7  Final QA Feedback Report -> aggregated into batch report (Phase 3)
  Phase 8  Commit                   -> NO COMMIT, Jira is canonical
```

The Refinement subagent's job is to produce a high-signal artifact for PO + Dev BEFORE the feature exists. Anything that requires running the system (data generation, parametrization tuning, fixture design) belongs in `/sprint-testing` Stage 1, not here.

---

## Inputs (per Story)

| Input | Source |
|-------|--------|
| Story (title, description, ACs, priority, labels, sprint, parent epic, comments) | `bun run jira:sync-issues get {STORY_KEY} --include-comments`, then read the synced `.md` (NEVER `acli view` — returns `null` for custom fields) |
| Team Discussion | Synced `comments.md` — same extraction rules as `session-entry-points.md` §Step 1b |
| Parent epic (if any) | `bun run jira:sync-issues get {EPIC_KEY}`, then read the synced epic `.md` — description + risk callouts only |
| Project-wide context | `.context/business/business-data-map.md`, `.context/business/business-feature-map.md`, `.context/business/business-api-map.md`, `.context/master-test-plan.md` |
| Module context (if it exists) | `.context/PBI/epics/EPIC-<EPIC_KEY>-<slug>/module-context.md` (module = Epic, 1:1) |
| Code (light read) | `{{BACKEND_REPO}}/{{BACKEND_ENTRY}}` + `{{FRONTEND_REPO}}/{{FRONTEND_ENTRY}}` — read enough to confirm feasibility, NOT to reproduce |
| Common gap catalog | `refinement-questions.md` (this skill) |
| ATP draft skeleton | `atp-draft-template.md` (this skill) |

---

## Output (per Story)

```
.context/PBI/epics/EPIC-<EPIC_KEY>-<slug>/stories/STORY-<STORY_KEY>-<slug>/
  context.md                   # NON-Jira working file — created if missing (minimal)
  shift-left-refinement.md     # NON-Jira working file — this subagent's deliverable
```

`shift-left-refinement.md` follows the skeleton in `atp-draft-template.md`. Both files are NON-Jira working artifacts authored locally. Jira-mirrored files (story.md, acceptance-criteria.md, etc.) are produced ONLY by the sync — NEVER hand-write them.

The subagent must NOT touch Jira. Phase 3 of the orchestrator skill owns all Jira mutations.

---

## Step 1 — Bootstrap the Story's PBI folder

If `.context/PBI/epics/EPIC-<EPIC_KEY>-<slug>/stories/STORY-<STORY_KEY>-<slug>/` does not exist:

1. Resolve the parent Epic — module = Epic (1:1). The epic folder is `EPIC-<EPIC_KEY>-<slug>` where `<slug>` is derived from the epic title (kebab-case). If the Story has no parent epic, use its module/component to name the epic folder.
2. Derive the story `<slug>` from the Story title — max 5 words, kebab-case.
3. Create the folder under `stories/STORY-<STORY_KEY>-<slug>/`.
4. Write a minimal `context.md` (template below). Do NOT include execution / smoke / evidence sections — those belong to `/sprint-testing` later.
5. Do NOT create `evidence/`. The Story has not shipped — there is nothing to capture.

### Minimal `context.md` template

```markdown
# {{PROJECT_KEY}}-{n}: {Title}
**Ticket:** {{PROJECT_KEY}}-{n} | **Module (= Epic):** {EPIC_KEY} {epic title} | **Status:** {Backlog | Shift-Left QA | Estimation | Ready For Dev} | **Sprint:** {n/a — pre-sprint}

## Acceptance Criteria (original)
- AC1: ...
- AC2: ...

## Team Discussion (from comments)
{If comments exist: [Author] (date): key point. If none: "No team discussions found.")}

## Parent epic
{EPIC_KEY}: {epic title}

## Pre-sprint status
Shift-Left refinement: in progress (started {{YYYY-MM-DD}})
```

If the folder already exists (because `/sprint-testing` ran on a sibling Story in the same module), DO NOT overwrite `context.md`. Just check it exists and proceed.

---

## Step 2 — Run `acceptance-test-planning.md` Phase 1: Critical Analysis

Read sprint-testing/references/acceptance-test-planning.md §"Phase 1 — Critical Analysis". Apply as-is with these scoping notes:

- **Code exploration is LIGHT.** Read entry files + 1-2 related files to confirm that the feature is implementable on the current codebase. Do NOT trace call graphs, do NOT open test files, do NOT measure performance. The cost ceiling is "would a senior dev say this is feasible in the current code".
- **Epic-level inheritance** — if `.context/PBI/epics/EPIC-<EPIC_KEY>-<slug>/feature-test-plan.md` exists, read it and reuse risks / integration points / PO answers verbatim. Cite, do not re-derive.
- **Story complexity rating** drives the depth of Phase 2 below.

Capture the output in the `## Phase 1 — Critical Analysis` section of `shift-left-refinement.md`.

---

## Step 3 — Run Phase 2: Story Quality Analysis (the heart of shift-left)

This is where shift-left actually creates value. Read sprint-testing/references/acceptance-test-planning.md §"Phase 2 — Story Quality Analysis" — apply it MORE DEEPLY than the in-sprint variant, because PO is still able to act on the findings.

For each:

- **Ambiguities** — location in Story + question for PO/Dev + impact on testing + suggested clarification.
- **Gaps (missing info)** — type (AC / technical detail / business rule) + why critical + what to add + risk if omitted.
- **Edge cases not in Story** — scenario + expected behavior (best guess, flag for PO confirmation) + criticality + action (add to AC / test only / ask PO).
- **Testability validation** — Yes / Partial / No + list of issues (vague AC, missing error messages, no test data examples, missing performance criteria, cannot isolate).
- **Contradictions** — sections of the Story (description vs ACs vs comments vs Figma link if present) that disagree. Surface explicitly: "Description says X but AC3 says Y".

Use the gap-catalog in `refinement-questions.md` as a checklist. The catalog is keyed by AC archetype (auth, money, search, state machine, list / table, integration). For each archetype matched in the Story, walk the corresponding question list.

If the Story is genuinely clear, say so. A short "Story quality: good — no significant gaps" is better than inventing questions. Quality > quantity.

Capture in `## Phase 2 — Story Quality Analysis` section of `shift-left-refinement.md`.

---

## Step 4 — Run Phase 3: Refined ACs

Read sprint-testing/references/acceptance-test-planning.md §"Phase 3 — Refined Acceptance Criteria". Apply as-is — Given / When / Then with specific data.

For each refined scenario:

- **Type**: Positive / Negative / Boundary / Edge
- **Priority**: Critical / High / Medium / Low
- **Given**: initial system state + preconditions
- **When**: triggering action with exact input values
- **Then**: expected UI result + API status+body (if applicable) + DB changes + system state

Mark any scenario that the refinement INFERRED (not literally in the original Story) with **NEEDS PO/DEV CONFIRMATION**. The marker survives into the Jira comment in Phase 3 — PO must see it during sprint planning.

Do not force a minimum count. A 1-line AC may need 1 scenario.

Capture in `## Phase 3 — Refined Acceptance Criteria` section of `shift-left-refinement.md`.

---

## Step 5 — Run Phase 4 (outline NAMES only)

Read sprint-testing/references/acceptance-test-planning.md §"Phase 4 — Test Design". Apply with these deltas:

| Phase 4 sub-step | Shift-Left action |
|------------------|------------------|
| Coverage estimate (Positive / Negative / Boundary / Integration / API counts) | **INCLUDE**. Drives PO estimation. |
| Rationale paragraph | INCLUDE. Short, 2-3 sentences. |
| Parametrization tables | **EXCLUDE**. Deferred to in-sprint. |
| Per-outline structure (Title, Related scenario, Type, Priority, Test level, Preconditions, Test steps, Expected result, Test data JSON, Post-conditions) | **REPLACED** by outline NAME + 1-line precondition + 1-line expected. No test-data JSON, no numbered steps. |
| Integration outlines (per integration point) | **NAMES ONLY**. List integration outlines as "Should validate {integration point} when {condition}". No mock strategy, no contract assertions. |

### Outline naming convention

Format: `Should <BEHAVIOR> <CONDITION>`. Same as `acceptance-test-planning.md` §Phase 4. Examples:

- `Should redirect to dashboard after successful OTP entry with valid code`
- `Should display "Code expired" error after OTP entry with code older than 5 minutes`
- `Should reject negative refund amount on POST /refunds`

Capture in `## Phase 4 — Test Outlines (DRAFT)` section of `shift-left-refinement.md`. Include the coverage estimate table at the top, then the outline list grouped by Type (Positive / Negative / Boundary / Integration).

---

## Step 6 — Run Phase 5 (edge-case NAMES only)

Read sprint-testing/references/acceptance-test-planning.md §"Phase 5 — Edge case + Test-data summary". Apply with these deltas:

| Phase 5 sub-step | Shift-Left action |
|------------------|------------------|
| Edge case table (case / in original story? / added to refined AC? / outline / priority) | **INCLUDE** but without "added to refined AC?" auto-resolution — that happens in-sprint. |
| Test-data categories table | **EXCLUDE**. Deferred to in-sprint. |
| Data generation strategy (Static / Faker / Cleanup) | **EXCLUDE**. Deferred to in-sprint. |

Capture in `## Phase 5 — Edge Cases (DRAFT)` section of `shift-left-refinement.md`.

---

## Step 7 — Summary block + open questions

End `shift-left-refinement.md` with:

- `## Story Quality Assessment` — one of: Good / Needs Improvement / Significant Issues.
- `## Critical Questions for PO` — questions raised in Phase 2 that BLOCK sprint planning until answered. Format: question / context / impact-if-unanswered / suggested answer (if you have one).
- `## Technical Questions for Dev` — questions that don't block PO but block implementation.
- `## Suggested Story Improvements` — current state -> suggested change -> benefit.
- `## Data feasibility flags` — if Phase 1 Selection marked `DATA-FEASIBILITY-RISK`, restate the risk here in concrete terms (which entity is missing, which API contract gap, which fixture needs to land first).
- `## Recommended testing strategy` — pre / during / post implementation (high-level, NOT outline-level). Same as `acceptance-test-planning.md` §Phase 7.

The subagent's RETURN TO ORCHESTRATOR is a compact summary derived from this block:

```json
{
  "story": "UPEX-100",
  "quality_assessment": "Needs Improvement",
  "ambiguity_count": 4,
  "gap_count": 3,
  "inferred_edge_cases": 7,
  "critical_po_questions": 2,
  "tech_questions": 3,
  "outline_count_by_type": { "positive": 4, "negative": 5, "boundary": 2, "integration": 1 },
  "data_feasibility_risk": false,
  "refinement_file": ".context/PBI/epics/EPIC-<EPIC_KEY>-<slug>/stories/STORY-UPEX-100-<slug>/shift-left-refinement.md",
  "open_blockers": []
}
```

The orchestrator presents the per-Story summary to the user, waits for OK, then dispatches the next Story's Refinement subagent (or moves to Phase 3 if this was the last Story).

---

## What the Refinement subagent must NOT do

- **No Jira mutations.** All updates land in Phase 3.
- **No test execution.** No smoke, no DB queries, no API calls. Refinement is doc-only.
- **No parametrization tables, no test-data JSON, no Faker recipes.** Deferred to in-sprint planning.
- **No TC creation.** TCs are formalized in Stage 4 (`/test-documentation`).
- **No git operations.** No branch, no commit.
- **No new ATP / ATR Jira issues.** Phase 3 may create a Test Plan in Modality jira-xray IF the user opted in — the Refinement subagent never does.
- **No `evidence/` folder.** Feature does not exist yet.
- **No "approval from user" mid-refinement.** Subagents do not prompt the user — they finish and return. The orchestrator presents and waits.

---

## Gotchas

1. **Light code reads.** Reproduction-grade exploration is for `/sprint-testing` Stage 2. Here, "is this feasible in the current codebase" is the bar.
2. **PO/Dev confirmation marker.** Any inferred scenario MUST carry `NEEDS PO/DEV CONFIRMATION` — verbatim, in English, in the local file and (later) in the Jira comment.
3. **Refinement quality > volume.** A Story with 4 ACs may legitimately yield 4 questions and 6 outlines. Forcing 15 outlines to look thorough dilutes value.
4. **Cite, do not duplicate.** `acceptance-test-planning.md` is the source of truth for Phases 1-5 mechanics. If a future change to that file affects shift-left, the change propagates automatically.
5. **Coverage estimate matters.** PO uses the per-Type counts to estimate Story points. Always include the table even if some Types are 0.
6. **Module-context reuse.** If `.context/PBI/epics/EPIC-<EPIC_KEY>-<slug>/module-context.md` exists (module = Epic, 1:1), read it and skip module-level code exploration. Story-level reads only.
7. **Output language**: artifact + Jira-bound content in English. Mirror user's language only in conversation. CLAUDE.md §1 Rule #14.

---

## Checklist before returning to the orchestrator

- [ ] PBI folder bootstrapped (created or detected); minimal `context.md` written if missing
- [ ] `shift-left-refinement.md` written with sections Phase 1 / Phase 2 / Phase 3 / Phase 4 (DRAFT) / Phase 5 (DRAFT) / Story Quality Assessment / Critical Questions / Tech Questions / Suggested Story Improvements / Data feasibility flags / Recommended testing strategy
- [ ] All inferred scenarios + edge cases carry `NEEDS PO/DEV CONFIRMATION`
- [ ] Phase 4 coverage estimate table included; per-outline test-data JSON NOT included
- [ ] Phase 5 edge-case names included; test-data generation strategy NOT included
- [ ] No Jira mutations performed
- [ ] Compact JSON summary returned to the orchestrator
