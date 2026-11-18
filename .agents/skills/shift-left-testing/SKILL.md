---
name: shift-left-testing
description: "Shift-left QA: refine acceptance criteria on a batch of backlog Stories before they enter a sprint. Use when shift-lefting or grooming the backlog; running pre-sprint AC refinement on listed Story IDs; drafting an ATP outline for Stories not yet in a sprint. Not for in-sprint QA (sprint-testing)."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode, pi]
complementary_categories: [testing-e2e, issue-tracker, tms]
metadata:
  kind: workflow
  stage_owner: true

---

## Inputs

Read in order, and stop early when the batch is small enough that later inputs add no signal.

1. The business context skills `business-e2e-context`, `business-data-context` and `business-api-context`, through `bun run context:map <slug>`: journeys, entity model, CRUD matrix, auth model, endpoint groups. They anchor refined ACs in real entities, flows and API behavior. The Readiness Preflight Gate and Phase 0.3 require all three.
2. `business-domain-context`, read the same way, for what each domain term means. Not a gate: a placeholder map means no glossary yet, so say so and refine in the Story's own words.
3. `.context/PBI/qa-artifacts/master-test-plan.md`: whether the Story falls inside an area that is already prioritized.
4. The Story's ACs and its `**Source spec:**` reference, read with `bun run jira:sync-issues get <STORY_KEY> --include-comments`, then the synced `acceptance-criteria.md` and description. `acli view` returns null for custom fields, so it is not used here. Every refined AC traces back to this input.
5. `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/` when a prior `/sprint-testing` cycle created it. Honor its session notes.
6. `.agents/jira-workflows.json`: the Story workflow (`backlog -> shift_left_qa -> ready_for_dev`), the source of the `{{jira.transition.story.*}}` slugs, and the resolver for the `[QA] Shift-Left Review` subtask. Confirm a subtask work type and its transitions exist before Phase 1 creates one; with none, skip the subtask steps with a warning and carry on.
7. `.agents/jira-required.yaml`: the slug catalog (`{{jira.acceptance_test_plan}}`, `{{jira.ai_effort}}`, the other Jira field slugs).

---

## Forbidden invocations

Do not invoke `/sdd-*` skills from this workflow. SDD is an optional ceremony the user installs, and this skill chains none of it. To refactor KATA, fixtures, `cli/`, `scripts/` or the `api/schemas/` pipeline, leave this skill and invoke `/framework-development`. The boundary is mechanical: `scripts/lint-skills.ts` rejects any `/sdd-` mention outside this section (`.agents/skills/agentic-qa-core/references/skill-composition-strategy.md` §4 governs users who install SDD by hand).

# Shift-left testing: pre-sprint AC refinement on a backlog batch

Run the pre-sprint shift-left loop on a set of backlog Stories so defects are prevented in the requirements instead of detected after implementation. Three phases, always in this order: Phase 1 Selection, Phase 2 Refinement, Phase 3 Handoff. When a Story later reaches `Ready For QA`, `/sprint-testing` takes over.

The skill is batch-by-design. One session refines N Stories so the PO and the Dev lead can run a single grooming pass with the team. There is no single-issue mode: for one urgent refinement, pass a list of length 1 and the cadence stays the same.

---

## How it differs from `/sprint-testing`

| Aspect | `/sprint-testing` | `/shift-left-testing` |
|-----|-------------------|----------------------|
| Cadence | In-sprint, ticket by ticket | Pre-sprint, batch grooming of N Stories |
| Entry status | `{{jira.status.story.ready_for_qa}}` | `{{jira.status.story.backlog}}` / `shift_left_qa` / `ready_for_dev` |
| Exit status | `{{jira.status.story.qa_approved}}` (full execution) | `{{jira.status.story.ready_for_dev}}` (refined, AI Effort set) |
| Audience | Dev and tester | PO / BA and tester (Dev lead optional) |
| Output | ATP, ATR, bugs, evidence | Refined ACs, risk map, pre-sprint ATP in the Story field (outlines only), AI Effort, subtask, batch report |
| Execution | Smoke plus UI / API / DB exploration | None: the feature does not exist yet |
| Code reads | Deep and targeted | Light (feasibility only) |
| TC creation | Yes, per the modality (`/sprint-testing` §"TC creation timing") | No: `/sprint-testing` or Stage 4 (`test-documentation`) creates them |
| Sprint-testing later | Full pipeline | Validation only when the synced ATP body this skill published is present; labels alone never open it (`sprint-testing/references/acceptance-test-planning.md` §0.0) |

The reuse is deliberate. Most of the refinement logic already lives in `sprint-testing/references/acceptance-test-planning.md` Phases 1-3, and Phase 2 below cites it instead of copying it.

---

## Dependencies

Requires `agentic-qa-core`. Loads on demand:

- `agentic-qa-core/references/test-design-doctrine.md`: before refining ACs or sizing outline coverage. A refinement that misses risk beyond the AC and 1:N coverage is incomplete.
- `agentic-qa-core/references/defect-management-doctrine.md`: for the QA-Assignee hook (Part 2). This skill is the earliest QA pickup of a backlog Story, so set `qa_assignee` to the authenticated session user, read before writing, and overwrite an existing owner only on an explicit, justified handover. No Bug, Defect or Improvement is filed here.
- `briefing-template.md`, `dispatch-patterns.md`, `orchestration-doctrine.md`, `session-management.md`, `preflight-gate.md` (all under `agentic-qa-core/references/`): cited where used.
- User-level skills, called with the Skill tool where a step says so: `grilling`, `domain-modeling`, `to-questionnaire`.
- When one of these is not installed (a person may have declined it), do that step inline from what this file says, note `<skill> not installed` in the batch report, and continue. Never block on it.

## Compact Rules

Test-design doctrine, binding (canon: `agentic-qa-core/references/test-design-doctrine.md`):

- ACs are the floor. Push past the happy path and surface the boundaries, exceptions, states and anomalies the Story is silent on.
- 1:N is the default: a non-trivial AC implies several outlines (valid partition, each distinct invalid input, boundaries, states). One outline for an AC needs a written "trivially atomic" justification.
- Tag each gap to a technique: ranges to BVA, status or lifecycle fields to State-Transition, two or more interacting conditions to Decision Table, three or more combinable factors to Pairwise.
- A refined AC (Given/When/Then) is the business assertion; the outline (`Should <behavior> <condition>`) is its exploration. Keep them distinct.

Shift-left rules:

- Stories only, in Backlog, Shift-Left QA or Ready For Dev. Bugs are reactive and have no upstream ACs.
- The output is refined ACs, gap and ambiguity questions, the pre-sprint ATP in `{{jira.acceptance_test_plan}}` (outline names and a coverage estimate; no test code, no execution, no Test Plan item, which `/sprint-testing` Stage 1 creates from the field), the closed `[QA] Shift-Left Review` subtask and the batch report.
- Each accepted Story gets a `[QA] Shift-Left Review` subtask: find or create it in Phase 1 with assignee = self (`create` lands it in `{{jira.status.subtask.active}}`), close it in Phase 3 with `{{jira.transition.subtask.complete}}` (to `{{jira.status.subtask.close}}`). Its status names are `ACTIVE` and `Close`. Long annotations go on the subtask to keep the Story clean. No subtask work type in `.agents/jira-workflows.json` means skip with a warning, never block.
- Phase 2 is the heart of the skill: edge cases, ambiguities and gaps the Story leaves out. They reach PO and Dev as questions and as derived outlines.
- On first QA pickup set `qa_assignee` to self, read before writing, never overwriting an existing owner (`defect-management-doctrine.md` Part 2).
- On completion add the label `shift-left-reviewed` and transition Backlog to Shift-Left QA to Ready For Dev.
- AI Effort is binding: in Phase 3 set `{{jira.ai_effort}}` (Low / Medium / High) on every refined Story with `references/ai-effort-checklist.md`. It sizes the whole item in an agentic workflow, implementing and verifying it, never a time or token forecast. `High` only warns: the handoff comment says the Story may need splitting, and it still moves to Ready For Dev. A PO may split and re-refine; the agent never splits or creates Stories. Whoever resolves a split may add one optional label (`split-accepted`, `split-edited`, `split-rejected`). With the field absent, write a structured `## AI Effort` comment, never block. DTU and QTU (`{{jira.development_token_usage}}`, `{{jira.quality_token_usage}}`) are written later by dev and QA, never here.
- Each interview step has a path for runs with nobody at the keyboard (`## With nobody at the keyboard`): record the questions and continue.

**Read full SKILL.md when**: running the batch grooming pipeline, writing the per-Story `shift-left-refinement.md`, or handling the PO/Dev handoff.

---

## Subagent Dispatch Strategy

> **Orchestration & Session contracts**: this skill follows `agentic-qa-core/references/orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `agentic-qa-core/references/session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 1 (plan write) are NOT optional. The orchestrator also applies the per-stage Definition-of-Done gates in `agentic-qa-core/references/stage-gates.md`: it verifies a stage's DoD (planning stages include the Test-Design Checklist) before it records the progress checkpoint and advances.

The scope is per batch: `<scope>` = `<YYYY-MM-DD>-<descriptor>` (for example `2026-05-20-payments-area`). Session state lives at `.session/shift-left-testing/<YYYY-MM-DD>-<descriptor>/{plan.md, progress.md}` (`session-management.md` §3 and §9). Each Story's `shift-left-refinement.md` stays in its PBI folder as a `[LOCAL]` staging buffer, disposable once Phase 3 publishes to Jira (`references/atp-outline-template.md`, `.context/PBI/README.md`). Every dispatch uses the 7-component briefing in `.agents/skills/agentic-qa-core/references/briefing-template.md`, with the pattern per phase from `.agents/skills/agentic-qa-core/references/dispatch-patterns.md`.

| Phase | Pattern | Subagent role |
|-------|---------|---------------|
| 1 Selection | Single | Pull candidates through `[ISSUE_TRACKER_TOOL]`, apply the veto and risk score, return a ranked table. After the OK, find or create the subtask per accepted Story (assignee = self, left at `{{jira.status.subtask.active}}`; skip with a warning without a subtask work type) |
| 2 Refinement | Sequential, one subagent per Story | Load `acceptance-test-planning.md` Phases 1-3 plus outline-only Phase 4, write `shift-left-refinement.md`, append the PO/Dev questions, return a summary block |
| 3 Handoff | Sequential, per Story | Update the Jira description and `{{jira.acceptance_test_plan}}` (no Test Plan item), post the comment, set labels, close the subtask, set `{{jira.ai_effort}}`, transition `backlog -> shift_left_qa -> ready_for_dev`. Return the transition log and trace check |
| 3 Batch report | Single | Aggregate the summaries into `.session/shift-left-testing/<batch-id>/batch-report.md` and post it to the parent epic when the Stories share one |

Phase 2 looks parallelizable but is sequential on purpose: the orchestrator presents each Story's summary before the next dispatch, which keeps the person in the loop, lets them veto a Story mid-batch and fits the team-grooming cadence.

When a subagent fails, stop and report the partial state (Stories refined, Jira mutations landed), then offer retry, skip-story or abort. No auto-fix, no auto-rollback. Mutations are recorded in the batch report so a partial session can resume. A skill that itself broke (wrong step, missing verifier, stale rule) is reported upstream per `../agentic-qa-core/references/upstream-feedback.md`: drafted and redacted locally, filed only on explicit OK, verified with `gh issue view`.

---

## Fleet seam (optional)

Refinement is sequential by default. A fleet (one persistent worker per Story, a conductor collecting reports) is available only when the user asks for it on a large batch.

- Same checkout: this skill writes only to Jira, so a worktree per Story is pure cost.
- The conductor always writes `launch.txt` in `.session/shift-left-testing/<batch-id>/`, one self-contained line per Story, whether or not an orchestration transport exists. Launching, supervising and closing sessions belongs to `/agent-orchestration` (`[ORCHESTRATION_TOOL]`); `launch.txt` is the payload for the human-paste fallback.
- The per-Story user OK moves to the conductor: it presents each worker's summary as it lands and waits for approve or veto before that Story's Phase 3 runs. A fleet that skips this is this skill not running.
- One writer per Story: every Jira write for a Story belongs to its worker. The batch report and epic comment stay with the conductor.
- A missing orchestration transport is never named to the user, the preflight gate or the batch report.

---

## Workflow

```
Phase 0  resume check, modality, tool skills, context check, candidate list, plan.md
Phase 1  read, Story filter, triage, ranked table, WAIT for OK, subtask per Story
Phase 2  per Story: subagent writes shift-left-refinement.md, summary, interview, WAIT for OK
Phase 3  per Story: Jira description, ATP field, comment, labels, AI Effort, transitions,
         subtask closed, light verifier; then batch report, epic comment, archive
```

Afterwards, outside this skill: `/sprint-testing` short-circuits Phases 1-3 only on fresh `shift-left-*` labels and the synced ATP body this skill published (`acceptance-test-planning.md` §0.0, fail-closed). Its Stage 1 creates the Test Plan item (`ATP: {STORY-KEY}: {title}`) from the `{{jira.acceptance_test_plan}}` field, as in-sprint work.

---

## Readiness Preflight Gate (runs before Phase 0)

Full doctrine: `agentic-qa-core/references/preflight-gate.md`. The gate runs before the resume check. Treat anything the user already stated (Story IDs, modality, "groom the backlog") as provided and ask only about real gaps. Probe, don't assume: surface gaps and REDs as one `AskUserQuestion` checklist, self-fix with approval and an explanation, and stop on a blocking RED. This skill executes nothing live, so the gate is a light tooling and context check; the generic baseline is in the reference §3.1. Below is this skill's delta.

| Capability | Need | Why here |
|---|---|---|
| Issue tracker (`[ISSUE_TRACKER_TOOL]`) | Required | All output lands on Jira. Load `/acli` and validate with `bun run jira:check`. |
| TMS modality | Required | Recorded in `plan.md` so `/sprint-testing` Stage 1 knows which engine creates the Test Plan item later. The pre-sprint ATP write is the same in both modalities. Probe: `test-documentation/SKILL.md` §Phase 0; ask only if every auto-check fails. |
| `/xray-cli` and `XRAY_*` creds | Not needed | No TMS items are created pre-sprint in either modality. |
| Business context maps and MTP | Required | `business-data-context`, `business-api-context` and `business-e2e-context` each exist with a generated map (`bun run context:map <slug> --list` prints sections, no placeholder notice), plus `.context/PBI/qa-artifacts/master-test-plan.md`. A missing skill needs `bun sync`; a placeholder map needs the matching `project-context` mode; a missing MTP cache is refreshed with `bun run context:hydrate`, then written by `project-context` mode `test-plan` if the Epic has none. |
| Candidate Story list | Required | Explicit IDs or a backlog JQL, with the size confirmed before Phase 1. |

Env reachability, test-user creds, DBHub, OpenAPI / API token, Playwright and `resend` are N/A because shift-left never runs against a live system. When every required row is green, continue to Phase 0.

---

## Phase 0 (session resume check and init)

0.0 Resume check (`agentic-qa-core/references/session-management.md` §4). Compute `<batch-id>` = `<YYYY-MM-DD>-<descriptor>` and look for `.session/shift-left-testing/<batch-id>/progress.md`. If it exists, read `plan.md` and the tail of `progress.md`, surface the last completed phase, the next one and any blocking notes, and offer resume, restart or abort. Restart first archives the directory to `.session/.archive/<YYYY-MM-DD>-shift-left-testing-<batch-id>-aborted/`. Abort stops.

0.1 Resolve the TMS modality with the probe `sprint-testing` uses at session start (`test-documentation/SKILL.md` §Phase 0) and persist it under `## Inputs` in `.session/shift-left-testing/<batch-id>/plan.md`, the canonical record (`session-management.md` §6).

0.2 Load `/acli` before any pseudocode below runs: it carries the syntax, flags and JSON payloads this skill leaves out, and it covers every write (custom-field update, comment, transition, label, subtask create) plus the trivial key, summary and status candidate search. Story detail reads go through `bun run jira:sync-issues get/jql`, not `acli view`. Do not load `/xray-cli`: the pre-sprint ATP lives in the `{{jira.acceptance_test_plan}}` field (fallback: the `## Acceptance Test Plan (ATP)` comment), and `/sprint-testing` Stage 1 creates the Test Plan item once the Story enters the sprint.

0.3 Verify the project-wide context. A file check is not enough, because a placeholder map passes it and carries nothing:
   - `bun run context:map business-data-context --list`
   - `bun run context:map business-e2e-context --list`
   - `bun run context:map business-api-context --list`
   - `.context/PBI/qa-artifacts/master-test-plan.md`

   A placeholder notice, a missing skill or a missing plan means stop and hand off to `project-discovery` (or the matching `project-context` modes `data`, `e2e`, `api`, `test-plan`). Without business context the PO/Dev questions are low value and the batch report bloats.

0.4 Resolve the candidate list, either way:
   - Explicit IDs (`UPEX-100,101,102,103` or any list of Story keys): use verbatim, no JQL.
   - Backlog JQL when the user says "groom the backlog" with no IDs: through `[ISSUE_TRACKER_TOOL]`, `project = {{PROJECT_KEY}}`, `issueType = Story`, `status in ({{jira.status.story.backlog}}, {{jira.status.story.shift_left_qa}}, {{jira.status.story.ready_for_dev}})`, plus `sprint in openSprints()` for "next sprint candidates", sorted by Priority DESC then Created DESC.

   Confirm the size with the user before Phase 1. Split a batch larger than 12 Stories into sessions with distinct `<descriptor>` values: past that, attention collapses and the batch report loses signal.

0.5 Create the session folder and write `plan.md`:

   ```
   .session/shift-left-testing/<YYYY-MM-DD>-<descriptor>/
     plan.md                # session-management.md §6 schema: Goal, Inputs (TMS modality +
                            #   candidate list), Approach, Phase breakdown, Risks,
                            #   Verification checklist, Cross-references
     progress.md            # append-only, one entry per phase (§7 schema)
     candidates.md          # Phase 1 output
     batch-report.md        # Phase 3 output
     # Per-Story refinement files live in each Story's PBI folder, not here:
     #   .context/PBI/epics/EPIC-<EPIC_KEY>-<slug>/stories/STORY-<STORY_KEY>-<slug>/shift-left-refinement.md
   ```

   The `<descriptor>` is kebab-case (`morning`, `payments-area`) so two sessions on one day stay independent. Append the first entry to `progress.md`: `## Phase 0 — Session Init — <ISO-8601 UTC>` with `status: completed` and `next: Phase 1 — Selection`. Later phases use the same shape (`session-management.md` §7).

---

## Phase 1: Selection

Phase 1 decides which Stories enter the refinement loop and how deep.

1. Read each candidate with `bun run jira:sync-issues get <STORY_KEY> --include-comments` (batch: `bun run jira:sync-issues jql "<backlog JQL>"`) and the synced `.md`: title, description, ACs, priority, type, labels, sprint, parent epic, comments. `acli search` is fine for the key, summary and status list only.
2. Type filter, hard: reject anything that is not a Story, and show the rejected list with a one-line reason each.
3. Label filter: a Story with `shift-left-reviewed` and a dated label `shift-left-{YYYY-MM-DD}` under 30 days old counts as already refined. List it apart under "Already Shift-Left Reviewed (skip or refresh?)" and let the user decide per Story. Freshness comes from the dated label, not the issue's `updated` timestamp, which any comment or rank change resets (`references/backlog-selection.md` §Step 2).
4. Triage each accepted candidate with the veto and risk score (rubric in `references/backlog-selection.md`):
   - Veto, skip: pure CSS, docs, static copy or tech-debt with no behavior change. Log the reason.
   - Require full: money, data integrity, auth, external integration, state machine or calculation forces refinement whatever the score.
   - Score 0-3 low: skip, the PO and Dev can write the ACs directly. 4-7 medium: full refinement. 8 and above high: full refinement plus an extended ambiguity and edge-case scan.
5. Present the ranked table (`references/backlog-selection.md` §Output format) and wait for the user's OK before Phase 2, the same pattern as sprint-testing's Story Explanation gate.
6. After the OK, find or create the `[QA] Shift-Left Review` subtask under each accepted Story with `assignee` = the authenticated session user (`agentic-qa-core/references/artifact-lifecycle.md` §2: an unassigned QA artifact is a blocker waiting to happen). Leave it in `{{jira.status.subtask.active}}`, where `create` lands it. Resolve the work type from `.agents/jira-workflows.json`; if there is none, or the project disallows subtasks, log a warning in `progress.md` and the batch report and skip. Match existing subtasks by exact title first, and re-open one already at `{{jira.status.subtask.close}}` with `{{jira.transition.subtask.reactive}}` (a refresh run). The subtask shows QA's pre-sprint work on the board and later receives the long annotations.
7. Front-load the PO's questions (optional: a person is at the keyboard and the PO is someone else). The Story reads often show gaps that need no code reading, such as an AC with no failure path, an undefined term or a number with no unit. Collect and dedupe them across the accepted Stories, then call the Skill tool with "to-questionnaire" to make one questionnaire for the PO. Interview the person only about the send, as that skill says (who receives it, what comes back). Write the file into `.session/shift-left-testing/<batch-id>/` and give the person its path. Sent before Phase 2, the answers can arrive while the batch is refined; questions that surface later join the Phase 3 handoff. With nobody at the keyboard, see `## With nobody at the keyboard`.

Persist the final accepted list in the Phase 1 entry of `progress.md` so a resume reads the same decision. After the OK append `## Phase 1 — Selection — <ts>` with `status: completed`, the accepted Story keys, `artifacts_touched: [candidates.md, progress.md]` and `next: Phase 2 — Refinement`.

---

## Phase 2: Refinement (per Story)

Dispatch one Refinement subagent per accepted Story. It loads the in-skill reference and applies the shift-left delta.

The reuse contract: the subagent reads `.agents/skills/sprint-testing/references/acceptance-test-planning.md` §Phases 1-3 plus Phase 4 (outline names only). The delta for shift-left mode:

| acceptance-test-planning.md phase | Shift-left adaptation |
|-----------------------------------|----------------------|
| Phase 0, Triage | Done in this skill's Phase 1. Skip. |
| Phase 1, Critical Analysis | Run as is. Light code exploration only (feasibility, not reproduction). |
| Phase 2, Story Quality Analysis | Run as is. This is the heart of shift-left: ambiguities, gaps, edge cases the Story leaves out, testability. |
| Phase 3, Refined ACs | Run as is: Given/When/Then with specific data. Mark inferred scenarios **NEEDS PO/DEV CONFIRMATION**. |
| Phase 4, Test Design (outlines) | Outline names only. No parametrization tables and no per-outline test-data JSON. The coverage estimate (Positive / Negative / Boundary / Integration counts) stays, because it feeds the AI Effort call and any later split decision. |
| Phase 5, Edge case and test-data summary | Edge-case names and criticality only. No data-generation strategy and no Faker recipes, because the feature does not exist yet. |
| Phase 6, Traceability and ticket updates | Owned by Phase 3 of this skill. The Refinement subagent only writes the local file; the Handoff subagent does the Jira mutations. |
| Phase 7, Final QA Feedback Report | The per-Story summary returned to the orchestrator, aggregated into the batch report in Phase 3. |
| Phase 8, Commit | Skipped. Jira is canonical: no git branch, no commit. |

The staging file is `.context/PBI/epics/EPIC-<EPIC_KEY>-<slug>/stories/STORY-<STORY_KEY>-<slug>/shift-left-refinement.md` (module = Epic, 1:1). Author it locally; it is not a Jira mirror, so the hand-write ban on mirrored files does not apply.

It is a buffer, not a deliverable. Phase 3 publishes its full body to the Jira `acceptance_test_plan` field, after which Jira holds the canonical copy and the synced `acceptance-test-plan.md` is the readable one. The file sits under the gitignored `.context/PBI/**`, so it exists only on the machine that ran the batch. Two consequences:

- Nothing downstream may depend on the staging file being on disk. `/sprint-testing` Stage 1 short-circuits off the synced `acceptance-test-plan.md`; otherwise the short-circuit silently degrades to a full re-run on any other machine.
- There is one ATP per Story: authored early into the `{{jira.acceptance_test_plan}}` field, then refined by `/sprint-testing` Stage 1 into the executable superset when it creates the Test Plan item. No `(Shift-Left DRAFT)` variant, no second Test Plan to reconcile.

Folder bootstrap: if the Story's PBI folder does not exist yet, the refinement subagent creates it. Mirrored content (`story.md`, `acceptance-criteria.md`, parent epic, comments) comes from `bun run jira:sync-issues get <STORY_KEY> --include-comments` and is never hand-written. Hand-authored files are only `shift-left-refinement.md` and `context.md` (local session notes), as in `sprint-testing/references/session-entry-points.md` §Step 7. No `evidence/` subfolder: there is nothing to capture yet.

### The summary, the interview and the OK

After the subagent returns, the orchestrator presents the per-Story summary (it replaces sprint-testing's Story Explanation step). The user's OK or veto comes before the next dispatch.

When the summary has genuine open questions (gaps, ambiguities, ACs marked NEEDS PO/DEV CONFIRMATION) and a person is at the keyboard, interview them:

1. Call the Skill tool with "grilling" and give it this Story's open questions. It asks in numbered rounds, each question with a recommended answer. An AC the Story already answers is not asked (gotcha 13), and a clean Story has no interview. Ask each round through the harness question tool (`agentic-qa-core/references/decision-elicitation-doctrine.md` §7), with grilling's recommended answer as the first option. Prose rounds are that doctrine's fallback only.
2. Fold each settled answer into the refined ACs and the open-questions list by sending the answers to a refinement subagent that updates `shift-left-refinement.md`. Remove the NEEDS PO/DEV CONFIRMATION marker only for an answer from someone who owns it (the PO or BA for behavior, the Dev for feasibility). An answer from the QA alone keeps the marker, so the PO still sees it at sprint planning.
3. When an answer settles a domain term the glossary lacks or contradicts, call the Skill tool with "domain-modeling" for that term. Here the glossary is the `business-domain-context` map, which accepts edits as proposals: load that skill and follow its `references/refresh.md`, a one-section edit with `evidence`, `before` and `after`, applied only on approval. A new term is a new `term-<slug>` section proposed the same way. Show the proposal in the interview and apply it on the person's yes. This skill never edits the map itself, and `business-domain-context` writes nowhere outside its own `references/`. Skip `domain-modeling`'s ADR offers: a Story refinement is not an architecture decision.
4. Questions the person cannot answer (they belong to the PO or Dev) stay in the list, travel to Jira in Phase 3 and can go into the PO questionnaire of Phase 1 step 7.

Without a person, take the path in `## With nobody at the keyboard` and move on.

Checkpoint per Story: after the summary is OK'd, append `## Phase 2.<n> — Refine <STORY_KEY> — <ts>` to `.session/shift-left-testing/<batch-id>/progress.md` (`session-management.md` §7) with `status: completed`, `artifacts_touched: [.context/PBI/.../shift-left-refinement.md]` and `next: Phase 2.<n+1> | Phase 3`, so a mid-batch resume skips refined Stories. When the whole list is done, the summaries feed Phase 3.

---

## Phase 3: Handoff

Dispatch a Handoff subagent per refined Story, one at a time, so the user can review the Jira state after each before the next mutation.

### Per-Story handoff sequence

Phase 0.2 already loaded `/acli`. The pseudocode uses `[ISSUE_TRACKER_TOOL]` only. This skill creates no TMS items, so `[TMS_TOOL]` never fires pre-sprint.

```
1. Write the refined ACs to the Jira acceptance_criteria field, then append the
   supporting analysis. Jira is the source of truth; local mirrored .md files are
   read-only caches from the sync, never hand-written.
     [ISSUE_TRACKER_TOOL] Update Issue:
       issue: {STORY_KEY}
       fields:
         {{jira.acceptance_criteria}}: <refined ACs from Phase 2>
     # FALLBACK (field absent): structured comment headed "## Acceptance Criteria"
     #   per the .agents/jira-required.yaml fallback: key. Never block.
   Then append "QA Refinements (Shift-Left Analysis)" to the Story description:
   Edge Cases Identified, Clarified Business Rules, Open Questions for PO / Dev.
   Run `bun run jira:sync-issues get {STORY_KEY} --include-comments` and read back
   the synced `acceptance-criteria.md` to confirm the field landed.

2. Populate the ATP, field first and identical in both modalities. One ATP per Story,
   authored early: no DRAFT item, no `(Shift-Left DRAFT)` title. /sprint-testing Stage 1
   creates the Test Plan ITEM from this content once the Story enters the sprint
   (`references/handoff-protocol.md` Step 2).
     [ISSUE_TRACKER_TOOL] Update Issue:
       issue: {STORY_KEY}
       fields:
         {{jira.acceptance_test_plan}}: <full shift-left-refinement.md body>
     # FALLBACK (field absent): skip this write; step 3's comment carries the full
     #   body inline per the .agents/jira-required.yaml fallback. Never block.

2b. Set AI Effort once the refinement is complete: answer `references/ai-effort-checklist.md`
   from the refined ACs, critical analysis and coverage estimate, then write the option.
     [ISSUE_TRACKER_TOOL] Update Issue:
       issue: {STORY_KEY}
       fields:
         {{jira.ai_effort}}: <low | medium | high>
     # FALLBACK (field absent): structured "## AI Effort" comment per the
     #   .agents/jira-required.yaml fallback: key. Never block.
     # High: step 3's comment ALSO carries the checklist's size note (a warning only;
     #   the Story still moves to ready_for_dev; the agent never splits or creates Stories).

3. Handoff comment on the Story. The ATP lives in {{jira.acceptance_test_plan}}, so
   do not mirror it; inline the full body as a `## Acceptance Test Plan (ATP)` comment
   ONLY when that field is absent.
     [ISSUE_TRACKER_TOOL] Add Comment:
       issue: {STORY_KEY}
       body: |
         ## Acceptance Test Plan (ATP) — ready for pre-sprint review
         The ATP lives in the {{jira.acceptance_test_plan}} field.
         # FALLBACK ONLY (field absent): replace the pointer line with the full staged body.
         AI Effort: {low | medium | high}
         # High only: append the "### AI Effort: High (may need splitting)" note from
         #   references/ai-effort-checklist.md. A warning, never a gate.

4. Labels:
     [ISSUE_TRACKER_TOOL] Update Issue:
       issue: {STORY_KEY}
       labels: +shift-left-reviewed, +shift-left-{{YYYY-MM-DD}}

5. Set QA Assignee, then transition (the Story is in backlog / shift_left_qa / ready_for_dev):
     # First QA pickup, the same moment the QA pulls the Story into refinement
     # (backlog -> shift_left_qa): set qa_assignee to the authenticated session user,
     # read before writing, ONLY when empty; overwrite an existing QA owner only on an
     # explicit, justified handover (defect-management-doctrine.md Part 2). acli
     # `workitem edit` CANNOT set customfields: use REST PUT /rest/api/3/issue/{KEY} with
     # { fields: { {{jira.qa_assignee}}: { accountId } } } (doctrine Part 6).
     [ISSUE_TRACKER_TOOL] Set qa_assignee = <authenticated session user>   # skip if already owned
     # If in backlog:
     [ISSUE_TRACKER_TOOL] Transition: {{jira.transition.story.analyze}}      # backlog -> shift_left_qa
     [ISSUE_TRACKER_TOOL] Transition: {{jira.transition.story.refined}}     # shift_left_qa -> ready_for_dev
     # If already in shift_left_qa, advance only the missing leg.
     # Stop at ready_for_dev: sprint commitment and dev start belong to PO and Dev.

6. Close the tracking subtask (skip with a warning if Phase 1 skipped it). Long annotations
   (analysis, refinement traces) go on the SUBTASK, keeping the Story clean.
     [ISSUE_TRACKER_TOOL] Add Comment / Update description:
       issue: {SUBTASK_KEY}          # "[QA] Shift-Left Review" under {STORY_KEY}
       body: <session annotations>
     [ISSUE_TRACKER_TOOL] Transition: {{jira.transition.subtask.complete}}   # active -> close
     # Unmapped slug: artifact-lifecycle.md §4 fallback (ask, never skip silently)

7. Verify the trace: `bun run jira:sync-issues get {STORY_KEY} --include-comments`, then
   read back the synced acceptance-test-plan field file and the handoff comment. Confirm
   the field is populated and the comment points to it (full body in the comment ONLY in
   fallback mode), and the subtask (when created) is at {{jira.status.subtask.close}}.

8. Run the light stage verifier (`agentic-qa-core/references/artifact-lifecycle.md` §5);
   the stage-specific lines are in `references/handoff-protocol.md` §Step 6b.
```

The Handoff subagent returns a per-Story log: `{story: KEY, atp_container: <field|fallback_comment>, subtask: <close|skipped>, labels_added: [...], transitions: [...], trace_status: ok|warning|fail}`.

### Batch report and archive

After all Stories are handed off, dispatch one Batch Report subagent (Single pattern) to write `.session/shift-left-testing/<batch-id>/batch-report.md`. The template is in `references/handoff-protocol.md` §Batch report template. It holds:

- Session metadata: date, mode, candidate count, accepted count, rejected count.
- One line per Story: ID, title, risk level, number of gaps, number of critical questions, transition status.
- The top PO/Dev open questions, deduped across Stories, and the path of any questionnaire written.
- The risk distribution (LOW / MEDIUM / HIGH counts).
- Blockers: Stories that surfaced data feasibility gaps, flagged for the PO before sprint planning.
- The recommended sprint-planning order, by risk and dependency.
- Any domain terms proposed to `business-domain-context` and left unapplied.
- The pointer to the next step: "When each Story reaches Ready For QA, run `/sprint-testing`. It short-circuits Phases 1-3 when it finds the ATP body published here in the synced `acceptance-test-plan.md` (the labels alone do not open it)."

When all Stories share one parent epic, also post the batch report as a comment on that epic. Otherwise deliver it inline to the user as the closing message.

After the report lands, append the final progress entry `## Phase 3 — Handoff + Batch report — <ts>` with `status: completed` and `next: stop`. Then archive per `agentic-qa-core/references/session-management.md` §8: move `.session/shift-left-testing/<batch-id>/` to `.session/.archive/<YYYY-MM-DD>-shift-left-testing-<batch-id>/` (the two-file dir is preserved) and call `mem_session_summary` with the session template and the archive path.

---

## With nobody at the keyboard

Shift-left also runs as a fleet worker or a scheduled routine, where nobody answers a question and waiting would stall the run. Each interview step then has a documented path, and the run continues:

- Interview: call the Skill tool with "grilling" and follow its autonomous path. Write every open question, with your recommended answer, into `## Critical Questions for PO` (behaviour) or `## Technical Questions for Dev` (feasibility) of `shift-left-refinement.md` (`references/atp-outline-template.md`), keep every inferred AC marked NEEDS PO/DEV CONFIRMATION, and say in the report which answers you assumed. The questions reach the PO through Phase 3 (the description section and the handoff comment), so the PO answers them at sprint planning.
- Glossary: do not edit the `business-domain-context` map. List each candidate term with its evidence and your recommended definition under "Proposed glossary terms" in the subtask annotations and the batch report. A supervised worker also sends them to its conductor, which decides whether to propose the edit to the person (that skill's own rule for workers).
- PO questionnaire: call the Skill tool with "to-questionnaire" and follow its autonomous path. Take the recipient (the PO named on the Story, else its reporter) and the needed facts from the open questions, state the assumption in one line under Purpose, write the file into `.session/shift-left-testing/<batch-id>/`, put its path in the batch report and keep going.

The Phase 1 table OK and the per-Story summary OK still apply. In a fleet the conductor holds them (Fleet seam). In a routine with no conductor, the delegating brief is the approval source when it names the Story list and says the handoff may write to Jira: record that source in `plan.md` and proceed. Without such a brief, make no Jira write (skip Phase 1 step 6 and all of Phase 3), run the rest of Phases 1 and 2, write each `shift-left-refinement.md` and the batch report, and report the batch as ready for handoff (`agentic-qa-core/references/decision-protocol.md`: Jira writes are outward actions).

---

## Gotchas

1. Credentials come from the environment by name, never hardcoded, as in sprint-testing.
2. Bugs, Spikes, Sub-tasks and Tech-debt are rejected in Phase 1, and a bug retest never joins a batch: bugs belong to `/sprint-testing`. For Tech-debt with behavior changes, ask the user to convert it to a Story first.
3. The veto beats the risk score (`acceptance-test-planning.md` §Phase 0). A Story already reviewed (label under 30 days old) is surfaced for skip or refresh, never skipped on its own.
4. Phase 2 yields outline titles and brief preconditions. Parametrization tables, per-outline test-data JSON and Faker recipes belong to `/sprint-testing` or Stage 4 (`/test-documentation`).
5. Every AC or edge case the refinement infers (not literally in the Story) carries the marker NEEDS PO/DEV CONFIRMATION, verbatim in the Jira description, comment and custom field, so the PO sees it at sprint planning.
6. No execution: no smoke, no DB query for data presence, no running app. Feasibility comes from reading code, APIs and the DB schema.
7. Never advance a Story beyond `{{jira.status.story.ready_for_dev}}`. A Story already past it gets a warning and no transition; the refinement still lands on Jira.
8. Always add both labels, `shift-left-reviewed` and `shift-left-{{YYYY-MM-DD}}`. The dated label tells `/sprint-testing` whether the refinement is fresh, but the short-circuit opens only on the published ATP body (`sprint-testing/references/acceptance-test-planning.md` §0.0). A label without the body means a full Phases 1-3 run, and a body without the labels breaks the cadence this skill exists to enable.
9. Jira is canonical: no git commit, no test branch. `shift-left-refinement.md` is a gitignored working artifact under `.context/PBI/**`. The populated `{{jira.acceptance_test_plan}}` field (or the `## Acceptance Test Plan (ATP)` fallback comment) is the contract `test-documentation` mode `repair-traceability` checks later.
10. Artifacts and Jira content are English; mirror the user's language only in conversation (`AGENTS.md` §1 Rule #14).
11. The final phase is done only after the two chat blocks of `../agentic-qa-core/references/session-footer-contract.md` are printed: the consolidated screenshot list (repo-relative paths, verified on disk, bug annotations first, each path surfaced the moment it lands) and the Session Footer (skills, MCPs, CLIs used, testing levels touched, an explicit "none" for expected levels left untouched). The framing is execution. Each subagent stage report carries the five footer fields (`skills_loaded`, `mcps_used`, `clis_used`, `testing_levels_touched`, `screenshots_captured`) and the orchestrator compiles the footer once. Chat only, never a Jira comment or ATR body. Lessons are proposed to `.session/<skill-slug>/<scope>/refinements.md`, never applied to a live skill (`../agentic-qa-core/references/skill-refinement-protocol.md`); the footer's `Refinements proposed:` line counts them.
12. Subtask tracking is best-effort. With no subtask work type, or subtasks disallowed, warn once in the batch report and proceed.
13. PO/Dev questions exist only for a real gap, ambiguity or untestable AC (`AGENTS.md` §1 Rule #4). A clean Story exits with an empty list. A question the AC body already answers in plain text is noise: reader bandwidth is the scarcest resource in grooming, and redundant questions teach the team to skim.
14. Author the ATP body in Markdown locally, convert and validate it with `.agents/skills/acli/scripts/md-to-adf.ts`, then publish the ADF JSON. Raw hand-written ADF drifts from the field content that `repair-traceability` validates, and `[ISSUE_TRACKER_TOOL]` does not convert Markdown on the CLI path (a Markdown body renders literal `#` and `**`, `sprint-testing` S6).
15. A Story reaches `ready_for_dev` only with a populated ATP (the field in both modalities, or the fallback comment). Without it Dev and PO guess the scope.
16. The pre-sprint ATP lives only in the field or its fallback comment. A pre-sprint Test Plan item wastes an artifact on a Story whose scope may still shrink and leaves Stage 1 a second copy to reconcile.

---

## What this skill hands to other skills

| After Phase 3 you need | Load | Reason |
|---|---|---|
| Sprint commitment and development | (manual: PO and Dev) | This skill stops at `{{jira.status.story.ready_for_dev}}`. A PO may split an AI Effort `High` Story first, which is optional. |
| In-sprint manual QA at `Ready For QA` | `/sprint-testing` | It checks fresh `shift-left-*` labels and the synced ATP body (fail-closed, `acceptance-test-planning.md` §0.0), short-circuits Phases 1-3 only then, and creates the Test Plan item from the `{{jira.acceptance_test_plan}}` field. |
| Formal TCs and ROI scoring | `/test-documentation` | Stage 4 turns outlines and refined ACs into Xray TCs (jira-xray) or Jira Test issues (jira-native). |
| Automated test code | `/test-automation` | Stage 5. |
| Regression execution | `/regression-testing` | Stage 6. |
| Business and master test plan context | `/project-discovery`, `project-context` modes `data` / `e2e` / `api` / `test-plan` | This skill consumes them and does not create them; Phase 0.3 stops and hands off when one is missing. |
| Adversarial dual review of a high-risk refinement | `/judgment-day` | Optional, never auto-invoked. |

---

## Pseudocode tags

| Tag | Resolves to | Defined in |
|-----|-------------|------------|
| `[ISSUE_TRACKER_TOOL]` | `acli`, the Atlassian MCP, or `{{ISSUE_TRACKER_CLI}}` | `AGENTS.md` Tool Resolution |
| `[TMS_TOOL]` | xray-cli skill (Modality jira-xray) or `acli` (Modality jira-native) | `AGENTS.md` Tool Resolution |
| `[ORCHESTRATION_TOOL]` | the multi-session orchestration CLI (fleet seam only) | `/agent-orchestration` |

Reads and writes are split (`agentic-qa-core/references/acli-integration.md` §"Reads vs writes"). Detailed reads (description, ACs, scope, comments, parent epic) go through `bun run jira:sync-issues get/jql`, then the synced `.md`. Writes (custom-field update, comment, transition, label, link) and the trivial key, summary and status candidate list go through `acli`. `acli view` is never used for a custom field.

Concrete tools (`bun`, `git`, `gh`) are used literally. Project variables resolve from `.agents/project.yaml` (env-scoped variables resolve to the active environment). Jira variables (`{{jira.status.story.*}}`, `{{jira.transition.story.*}}`, `{{jira.acceptance_test_plan}}`, `{{jira.ai_effort}}`) resolve from `.agents/jira-workflows.json` and `.agents/jira-fields.json`.

---

## References

Load the narrow one for the situation.

| Reference | Read when |
|---|---|
| `references/backlog-selection.md` | Phase 0.4 and 1: candidate JQL, veto and risk-score triage, the candidate table. |
| `references/refinement-playbook.md` | Phase 2: the refinement subagent and the shift-left deltas. |
| `references/atp-outline-template.md` | Phase 2: body skeleton for `shift-left-refinement.md`, lighter than sprint-testing's ATP body. |
| `references/refinement-questions.md` | Phase 2: PO / Dev / Design gap-spotting questions by AC archetype, a checklist for sparse Stories. |
| `references/ai-effort-checklist.md` | Phase 3: setting `{{jira.ai_effort}}`, the size note for High, the split labels, a worked example. |
| `references/handoff-protocol.md` | Phase 3: Jira mutation sequence per Story, label and transition rules, batch report template, epic-comment rules. |
| `../agentic-qa-core/references/artifact-lifecycle.md` | Before any transition: lifecycle rows (§1), assignee at create (§2), unmapped-status fallback (§4), light stage verifier (§5). |
| `../agentic-qa-core/references/session-management.md` | Phase 0 and archive: resume contract, `plan.md` and `progress.md` schemas, archive policy, Engram checkpoint. This skill is a producer of `session/shift-left-testing/<batch-id>/...` topic keys. |

---

## Pre-flight checklist

- [ ] Resume check ran, modality persisted to `plan.md` §Inputs, `/acli` loaded (no `/xray-cli`), context maps verified, candidate list confirmed, `plan.md` written
- [ ] Phase 1: ranked table OK'd, subtask found or created per Story (assignee = self) or skipped with a warning; PO questionnaire written or its autonomous path taken
- [ ] Phase 2: one subagent per Story, each summary OK'd, interview run on genuine open questions (or recorded), new domain terms proposed to `business-domain-context`, `shift-left-refinement.md` written per Story
- [ ] Phase 3 per Story: Jira description, ATP field, AI Effort, comment, labels, transition stopping at `ready_for_dev`, no Test Plan item, subtask closed (or skipped with a warning), trace verified, light stage verifier all YES or a stated N/A
- [ ] Batch report written and posted to the parent epic if there is one; archived; `mem_session_summary` called; no git commit
- [ ] User told to run `/sprint-testing` when each Story reaches `Ready For QA`, and session footer plus the consolidated screenshot list printed in chat, never in a Jira comment
