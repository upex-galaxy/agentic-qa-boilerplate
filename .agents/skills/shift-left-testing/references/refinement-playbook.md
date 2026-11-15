# Refinement Playbook: Phase 2, per-Story subagent

This is the main reference for the Phase 2 Refinement subagent (see `shift-left-testing/SKILL.md` §Subagent Dispatch Strategy). It runs once per Story, reads the in-sprint playbook `sprint-testing/references/acceptance-test-planning.md`, applies the shift-left changes listed here, and writes one file: `shift-left-refinement.md` in the Story's PBI folder. Anything this file does not override behaves as in `acceptance-test-planning.md`, which stays the source of truth and is cited here, never copied.

The goal is a high-signal artifact for the PO and Dev before the feature exists, so they can still change the Story. Whatever needs the running system (data generation, parametrization tuning, fixture design) waits for `/sprint-testing` Stage 1.

---

## Reuse contract

```
Source of truth (cited, not duplicated):
  .agents/skills/sprint-testing/references/acceptance-test-planning.md

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
  Phase 8  Commit                   -> no commit, Jira is canonical
```

---

## Interview and domain language

The subagent never talks to a person, so the interview lives one level up. The orchestrator (the session the person types into) runs it before or after dispatch, and the skills below carry the method, so nothing of them is copied here.

- When a Story or a batch needs stress-testing with the PO or Dev in the room, the orchestrator calls the Skill tool with "grilling" and feeds it the ambiguities, gaps and contradictions from Phase 2.
- When the Story uses a term the project has not defined, or uses a known term in a new way, the orchestrator calls the Skill tool with "domain-modeling". New terms and decisions go to `business-domain-context`, so the next Story does not ask the same thing again.
- When the PO has to answer questions later and asynchronously, the orchestrator calls the Skill tool with "to-questionnaire" on the Critical Questions from Step 7.
- When nobody is available (an unattended or autonomous run), nothing waits. The subagent writes every open point as a Critical or Technical Question with a suggested answer, and the refinement goes on.

---

## Inputs (per Story)

| Input | Source |
|-------|--------|
| Story (title, description, ACs, priority, labels, sprint, parent epic, comments) | `bun run jira:sync-issues get {STORY_KEY} --include-comments`, then read the synced `.md` (never `acli view`, which returns `null` for custom fields) |
| Team Discussion | Synced `comments.md`, same extraction rules as `session-entry-points.md` §Step 1b |
| Parent epic (if any) | `bun run jira:sync-issues get {EPIC_KEY}`, then read the synced epic `.md`: description and risk callouts only |
| Project-wide context | the business context skills (`bun run context:map business-data-context` / `business-e2e-context` / `business-api-context`), `.context/PBI/qa-artifacts/master-test-plan.md` |
| Module context (if it exists) | `.context/PBI/epics/EPIC-<EPIC_KEY>-<slug>/module-context.md` (module = Epic, 1:1) |
| Code (light read) | `{{BACKEND_REPO}}/{{BACKEND_ENTRY}}` + `{{FRONTEND_REPO}}/{{FRONTEND_ENTRY}}`: read enough to confirm feasibility, not to reproduce |
| Common gap catalog | `refinement-questions.md` (this skill) |
| ATP outline skeleton | `atp-outline-template.md` (this skill) |

---

## Output (per Story)

```
.context/PBI/epics/EPIC-<EPIC_KEY>-<slug>/stories/STORY-<STORY_KEY>-<slug>/
  context.md                   # NON-Jira working file, created if missing (minimal)
  shift-left-refinement.md     # NON-Jira working file, this subagent's deliverable
```

`shift-left-refinement.md` follows the skeleton in `atp-outline-template.md`. Both files are local working artifacts. The Jira-mirrored files (story.md, acceptance-criteria.md and the like) come only from the sync, so never hand-write them.

The subagent does not touch Jira. Phase 3 of the orchestrator skill owns every Jira mutation.

---

## Step 1: Bootstrap the Story's PBI folder

If `.context/PBI/epics/EPIC-<EPIC_KEY>-<slug>/stories/STORY-<STORY_KEY>-<slug>/` does not exist:

1. Resolve the parent Epic (module = Epic, 1:1). The epic folder is `EPIC-<EPIC_KEY>-<slug>`, where `<slug>` is the epic title in kebab-case. If the Story has no parent epic, name the epic folder after its module or component.
2. Derive the story `<slug>` from the Story title: at most 5 words, kebab-case.
3. Create the folder under `stories/STORY-<STORY_KEY>-<slug>/`.
4. Write a minimal `context.md` (template below). Leave out execution, smoke and evidence sections, which belong to `/sprint-testing` later.
5. Skip `evidence/`. The Story has not shipped, so there is nothing to capture.

### Minimal `context.md` template

```markdown
# {{PROJECT_KEY}}-{n}: {Title}
**Ticket:** {{PROJECT_KEY}}-{n} | **Module (= Epic):** {EPIC_KEY} {epic title} | **Status:** {Backlog | Shift-Left QA | Ready For Dev} | **Sprint:** {n/a — pre-sprint}

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

If the folder already exists (because `/sprint-testing` ran on a sibling Story in the same module), leave `context.md` alone: check it exists and go on.

---

## Step 2: Phase 1, critical analysis

Read `sprint-testing/references/acceptance-test-planning.md` §"Phase 1 — Critical Analysis" and apply it as-is, with these scoping notes:

- Keep code exploration light. Read the entry files and one or two related files to confirm the feature is implementable on the current codebase. Skip call graphs, test files and performance measurements. The bar is "would a senior dev say this is feasible in the current code".
- If `.context/PBI/epics/EPIC-<EPIC_KEY>-<slug>/feature-test-plan.md` exists, read it and reuse its risks, integration points and PO answers verbatim. Cite them, do not re-derive them.
- The Story complexity rating sets how deep Phase 2 goes.

Capture the output in the `## Phase 1 — Critical Analysis` section of `shift-left-refinement.md`.

---

## Step 3: Phase 2, story quality analysis

This is where shift-left creates its value. Read `sprint-testing/references/acceptance-test-planning.md` §"Phase 2 — Story Quality Analysis" and go deeper than the in-sprint variant does, because the PO can still act on the findings.

For each of these, write down:

- Ambiguities: location in the Story, the question for PO/Dev, the impact on testing, a suggested clarification.
- Gaps (missing info): type (AC, technical detail or business rule), why it matters, what to add, the risk if omitted.
- Edge cases not in the Story: the scenario, the expected behavior (best guess, flagged for PO confirmation), criticality, and the action (add to AC, test only, or ask the PO).
- Testability: Yes, Partial or No, plus the issues (vague AC, missing error messages, no test data examples, missing performance criteria, cannot isolate).
- Contradictions: places where the description, the ACs, the comments or a linked design disagree. Say it plainly, for example "Description says X but AC3 says Y".

Use the gap catalog in `refinement-questions.md` as a checklist. It is keyed by AC archetype (auth, money, search, state machine, list or table, integration). For each archetype the Story matches, walk that question list.

If the Story is clear, say so. A short "Story quality: good, no significant gaps" beats invented questions.

Capture the result in the `## Phase 2 — Story Quality Analysis` section of `shift-left-refinement.md`.

---

## Step 4: Phase 3, refined ACs

Read `sprint-testing/references/acceptance-test-planning.md` §"Phase 3 — Refined Acceptance Criteria" and apply it as-is: Given / When / Then with specific data.

For each refined scenario, give:

- Type: Positive / Negative / Boundary / Edge
- Priority: Critical / High / Medium / Low
- Given: initial system state and preconditions
- When: the triggering action with exact input values
- Then: the expected UI result, the API status and body (if applicable), DB changes and system state

Mark every scenario the refinement inferred (one the original Story does not literally state) with **NEEDS PO/DEV CONFIRMATION**. The marker carries into the Jira comment in Phase 3, so the PO sees it during sprint planning.

One AC usually means several scenarios, so explode first and justify any collapse. Derive them from the AC's shape (`agentic-qa-core/references/test-design-doctrine.md` Part 2): a range or limit gives boundary scenarios (BVA); a status field gives valid and invalid transitions; two or more interacting conditions give a decision-table set; three or more factors give pairwise. Collapse an AC to one scenario only when it is trivially atomic (one boolean, no ranges, states or interactions) and say so. A one-line AC that hides a range or a state is not a one-scenario AC.

Capture the result in the `## Phase 3 — Refined Acceptance Criteria` section of `shift-left-refinement.md`.

---

## Step 5: Phase 4, outline names only

Read `sprint-testing/references/acceptance-test-planning.md` §"Phase 4 — Test Design" and apply it with these deltas:

| Phase 4 sub-step | Shift-Left action |
|------------------|------------------|
| Coverage estimate (Positive / Negative / Boundary / Integration / API counts) | Include. It feeds the AI Effort call and the split decision. |
| Rationale paragraph | Include, short: 2-3 sentences. |
| Parametrization tables | Exclude. Deferred to in-sprint. |
| Per-outline structure (Title, Related scenario, Type, Priority, Test level, Preconditions, Test steps, Expected result, Test data JSON, Post-conditions) | Replaced by the outline name, a 1-line precondition and a 1-line expected result. No test-data JSON, no numbered steps. |
| Integration outlines (per integration point) | Names only, written as "Should validate {integration point} when {condition}". No mock strategy, no contract assertions. |

### Outline naming convention

Format: `Should <BEHAVIOR> <CONDITION>`, the same as `acceptance-test-planning.md` §Phase 4. Examples:

- `Should redirect to dashboard after successful OTP entry with valid code`
- `Should display "Code expired" error after OTP entry with code older than 5 minutes`
- `Should reject negative refund amount on POST /refunds`

Capture the result in the `## Phase 4 — Test Outlines (outline names only)` section of `shift-left-refinement.md`: the coverage estimate table first, then the outline list grouped by Type (Positive / Negative / Boundary / Integration).

---

## Step 6: Phase 5, edge-case names only

Read `sprint-testing/references/acceptance-test-planning.md` §"Phase 5 — Edge case + Test-data summary" and apply it with these deltas:

| Phase 5 sub-step | Shift-Left action |
|------------------|------------------|
| Edge case table (case / in original story? / added to refined AC? / outline / priority) | Include, without the automatic resolution of "added to refined AC?". That happens in-sprint. |
| Test-data categories table | Exclude. Deferred to in-sprint. |
| Data generation strategy (Static / Faker / Cleanup) | Exclude. Deferred to in-sprint. |

Capture the result in the `## Phase 5 — Edge Cases (outline)` section of `shift-left-refinement.md`.

---

## Step 7: Summary block and open questions

End `shift-left-refinement.md` with:

- `## Story Quality Assessment`: one of Good / Needs Improvement / Significant Issues.
- `## Critical Questions for PO`: questions from Phase 2 that block sprint planning until answered. Each has the question, the context, the impact if unanswered, and a suggested answer when you have one.
- `## Technical Questions for Dev`: questions that do not block the PO but do block implementation.
- `## Suggested Story Improvements`: current state, suggested change, benefit.
- `## Data feasibility flags`: if Phase 1 Selection marked `DATA-FEASIBILITY-RISK`, restate the risk concretely (which entity is missing, which API contract gap, which fixture has to land first).
- `## Recommended testing strategy`: before, during and after implementation, at a high level and not at outline level. Same as `acceptance-test-planning.md` §Phase 7.

The subagent returns a compact summary derived from this block to the orchestrator:

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

The orchestrator presents the per-Story summary to the user, waits for the OK, then dispatches the next Story's subagent (or moves to Phase 3 after the last one).

---

## What the Refinement subagent leaves alone

Each item is out of scope here because another phase or skill owns it.

- Jira mutations: all updates land in Phase 3.
- Test execution: no smoke, no DB queries, no API calls. Refinement is doc-only.
- Parametrization tables, test-data JSON and Faker recipes: deferred to in-sprint planning.
- TC creation: `/sprint-testing` Stage 1 (Modality jira-xray) or Stage 4 `/test-documentation` (Modality jira-native) creates them, per `sprint-testing/SKILL.md` §"TC creation timing".
- Git operations: no branch, no commit.
- New ATP / ATR Jira issues: Phase 3 publishes the ATP to the `{{jira.acceptance_test_plan}}` field only, and nobody in this skill creates TMS items. The Test Plan issue is created later by `/sprint-testing` Stage 1 from the field content.
- Subtask mutations: the `[QA] Shift-Left Review` tracking subtask belongs to the orchestrator (Phase 1: find-or-create, then `{{jira.status.subtask.active}}`; Phase 3: annotations, then `{{jira.status.subtask.close}}`).
- An `evidence/` folder: the feature does not exist yet.
- Asking the user mid-refinement: subagents finish and return, and the orchestrator presents and waits.

---

## Gotchas

1. Light code reads. Reproduction-grade exploration is for `/sprint-testing` Stage 2. Here the bar is "is this feasible in the current codebase".
2. The `NEEDS PO/DEV CONFIRMATION` marker goes on every inferred scenario, verbatim and in English, in the local file and later in the Jira comment.
3. Outline count comes from the techniques, not from a target. EP partitions, BVA boundaries, state transitions and decision-table rules decide it. Padding (an outline that explores nothing new) and under-derivation (a range with no boundary outline, a status field with no invalid-transition outline) are both failures. A 4-AC Story with two ranges and a state machine will legitimately exceed 6 outlines.
4. Cite, do not duplicate. `acceptance-test-planning.md` is the source of truth for the Phase 1-5 mechanics, so a later change there reaches shift-left on its own.
5. The coverage estimate matters. The per-Type counts feed the AI Effort call and the split decision (`references/ai-effort-checklist.md`): many Boundary or Integration outlines push toward Medium or High, and a High Story gets a size note (a warning, not a gate) in the handoff comment. Include the table even when some Types are 0.
6. Module-context reuse. If `.context/PBI/epics/EPIC-<EPIC_KEY>-<slug>/module-context.md` exists (module = Epic, 1:1), read it and skip module-level code exploration. Story-level reads only.
7. Output language. The artifact and everything bound for Jira are in English; mirror the user's language only in conversation (AGENTS.md §1 Rule #14).

---

## Checklist before returning to the orchestrator

- [ ] PBI folder bootstrapped (created or detected); minimal `context.md` written if missing
- [ ] `shift-left-refinement.md` written with sections Phase 1 / Phase 2 / Phase 3 / Phase 4 (outline names only) / Phase 5 (outline) / Story Quality Assessment / Critical Questions / Tech Questions / Suggested Story Improvements / Data feasibility flags / Recommended testing strategy
- [ ] All inferred scenarios and edge cases carry `NEEDS PO/DEV CONFIRMATION`
- [ ] Phase 4 coverage estimate table included; per-outline test-data JSON not included
- [ ] Phase 5 edge-case names included; test-data generation strategy not included
- [ ] No Jira mutations performed
- [ ] Compact JSON summary returned to the orchestrator
