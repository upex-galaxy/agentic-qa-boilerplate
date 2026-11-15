# Handoff Protocol: Phase 3 (per-story Jira mutation and batch report)

> **Subagent context**: this file is the "Context docs" reference for the Phase 3 Handoff subagent and the Batch Report subagent (see `shift-left-testing/SKILL.md` §Subagent Dispatch Strategy and §Phase 3). It owns the Jira mutations and the final report. Refinement content comes from `atp-outline-template.md` and the per-Story `shift-left-refinement.md`.

The Handoff subagent runs once per refined Story. The Batch Report subagent runs once per session, at the end. Both run sequentially.

The goal of the handoff is that a PO, a dev lead and the later `/sprint-testing` run find everything they need in Jira, in the right place, without a second copy to reconcile. The protocol covers:

1. The per-Story Jira mutation sequence: ACs, description, ATP field, AI Effort, handoff comment, labels, transition, subtask close, trace verify.
2. Modality: the ATP write is field-first in both modalities. Modality only matters later, when `/sprint-testing` Stage 1 creates the Test Plan item from the field.
3. The transition guardrail: stop at `ready_for_dev`.
4. The batch report template and the epic-comment posting rules.

---

## Inputs (per Story)

| Input | Source |
|-------|--------|
| Refined refinement file (non-Jira working file) | `.context/PBI/epics/EPIC-<EPIC_KEY>-<slug>/stories/STORY-<STORY_KEY>-<slug>/shift-left-refinement.md` |
| Current Story status | `bun run jira:sync-issues get {STORY_KEY}`, then read the synced status (or `acli search` for the trivial status-only lookup) |
| Current Story labels | Same synced read, labels list |
| Modality | The session's `plan.md` §Inputs (`.session/shift-left-testing/<batch-id>/`, resolved in shift-left-testing Phase 0.1). Informational here, since the ATP write is field-first in both modalities |
| TMS field map | `.agents/jira-fields.json`: `{{jira.acceptance_criteria}}`, `{{jira.acceptance_test_plan}}`, `{{jira.ai_effort}}` |
| Workflow transitions | `.agents/jira-workflows.json`: `{{jira.transition.story.analyze}}`, `{{jira.transition.story.refined}}` |
| Tracking subtask | The `[QA] Shift-Left Review` subtask created in Phase 1 (`{{jira.status.subtask.active}}`; the subtask workflow names are `ACTIVE` and `Close`, not "In Progress" and "Done"). Step 5b closes it with `{{jira.transition.subtask.complete}}`. When the catalog has no subtask work type, Phase 1 skipped it, and Step 5b skips with a warning too |
| Artifact lifecycle | `agentic-qa-core/references/artifact-lifecycle.md`: §1 (Story and subtask rows), §2 (assignee = self on the subtask at create), §4 (unmapped-status fallback), §5 (light stage verifier) |

---

## Per-Story handoff sequence

> **Prerequisite**: the `/acli` skill is loaded (Phase 0.2). `/xray-cli` is not needed, because this protocol creates no TMS items.

### Step 1a: write refined ACs to the Jira `acceptance_criteria` field

The refined Acceptance Criteria are canonical and belong in the dedicated Jira field. Jira is the source of truth, and the local `acceptance-criteria.md` is a read-only cache produced by the sync, so the agent edits the field and leaves that file alone.

```
[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {STORY_KEY}
  fields:
    {{jira.acceptance_criteria}}: <Refined ACs — Phase 3 of shift-left-refinement.md verbatim>
```

Fallback when the field is absent on this instance: post the refined ACs as a structured comment headed `## Acceptance Criteria`, per `.agents/jira-required.yaml` → `acceptance_criteria.fallback` (`{ target: comment, label: "Acceptance Criteria" }`). A missing field never blocks the handoff.

After writing, run `bun run jira:sync-issues get {STORY_KEY} --include-comments` and read back the synced `acceptance-criteria.md` to confirm the field (or the fallback comment) landed.

### Step 1b: append supporting analysis to the Story description

Append a "QA Refinements (Shift-Left Analysis)" section to the Story description. Its body is a condensed extract of the supporting analysis from `shift-left-refinement.md`. The refined ACs live in the field from Step 1a, the full body goes into the ATP (Step 2), and the Step 3 comment points to it. Keep the description readable in the Jira UI without endless scrolling.

Description section template:

```markdown
---

## QA Refinements (Shift-Left Analysis) — Added {{YYYY-MM-DD}}

> Refined Acceptance Criteria live in the `acceptance_criteria` field (Step 1a).

### Edge Cases Identified
{Copy Phase 5 edge-case table verbatim.}

### Clarified Business Rules
{Any rule extracted from Phase 2 Story Quality Analysis that the original Story did not state explicitly.}

### Critical Questions for PO
{Numbered list — copy verbatim from shift-left-refinement.md §Critical Questions for PO.}

### Technical Questions for Dev
{Numbered list — copy verbatim from §Technical Questions for Dev.}

> Full refinement (Phases 1-5, coverage outlines, risk + data feasibility) lives in the ATP — the `{{jira.acceptance_test_plan}}` field (Step 2; `/sprint-testing` Stage 1 later materializes it as the Test Plan issue).
```

```
[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {STORY_KEY}
  description: <existing description + "\n\n" + QA Refinements section>
```

Read the current description first (from the synced `.md`), then append. Overwriting would destroy the PO's original text.

### Step 2: populate the ATP (field-first, both modalities)

There is one ATP per Story, authored early, as field content and never as an item. Shift-Left creates neither a separate DRAFT artifact nor the Test Plan issue. Before the sprint, the ATP's home is the `{{jira.acceptance_test_plan}}` custom field on the Story. `/sprint-testing` Stage 1 creates the real Test Plan issue (titled `ATP: {STORY-KEY}: {story title}`, parented to the QA Master Test Plan epic, linked to the Story) from this field content and refines the same ATP into the executable superset. There is no `(Shift-Left DRAFT)` title variant and no second Test Plan to reconcile.

Why field-first: the Story is not in a sprint yet and its scope may shrink (a PO may split a High AI Effort Story). Creating an item this early wastes an artifact and leaves Stage 1 a second copy to reconcile. The field is the only pre-sprint ATP write in both modalities, and modality only decides which engine Stage 1 uses later.

What marks this ATP as pre-sprint is the Story's `shift-left-reviewed` and `shift-left-{YYYY-MM-DD}` labels, not the title. Stage 1 reads those labels first, but they only claim a pass. The short-circuit opens only when the synced ATP body published here is present too (`sprint-testing/references/acceptance-test-planning.md` §0.0, fail-closed).

The write is identical in Modality jira-xray and Modality jira-native:

```
[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {STORY_KEY}
  fields:
    {{jira.acceptance_test_plan}}: <full shift-left-refinement.md body>
```

Fallback when the instance has not provisioned `{{jira.acceptance_test_plan}}`: skip the field write and switch Step 3 to fallback mode, where the `## Acceptance Test Plan (ATP)` comment carries the full body inline, per `.agents/jira-required.yaml` → `acceptance_test_plan.fallback` (`{ target: comment, label: "Acceptance Test Plan (ATP)" }`). Warn the user in the per-Story summary. The handoff continues.

### Step 2b: set AI Effort

This is QA's sizing call, made after the refinement is complete. Answer the ordered checklist in `references/ai-effort-checklist.md` from the refined ACs, the Phase 1 critical analysis and the coverage estimate, then write one option. AI Effort is the effort of the whole item in an agentic workflow (implementing and verifying it). It is not a time and not a token estimate.

```
[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {STORY_KEY}
  fields:
    {{jira.ai_effort}}: <low | medium | high>      # option slugs: {{jira.ai_effort.low}} / .medium / .high
```

Fallback when the field is absent on this instance: post a structured comment headed `## AI Effort` with the value and the question numbers that tipped it, per `.agents/jira-required.yaml` → `ai_effort.fallback`. The handoff continues. Leave `{{jira.development_token_usage}}` and `{{jira.quality_token_usage}}` alone: the dev agent and the QA agent measure and write those later.

Idempotency: read the current value first. A value a human set stays, and the checklist result goes into the per-Story summary as a suggestion.

### Step 3: handoff notification and fallback comment

Jira is the source of truth, and the ATP lives in the `{{jira.acceptance_test_plan}}` field (Step 2). When the field exists, a mirrored copy in a comment would only drift, so post one handoff comment on the Story:

- **Field present (default)**: a short notification that the pre-sprint ATP is ready for review in the `{{jira.acceptance_test_plan}}` field, without the full body.
- **Fallback, only when `{{jira.acceptance_test_plan}}` is absent on this instance** (per `.agents/jira-required.yaml` → `acceptance_test_plan.fallback`, `{ target: comment, label: "Acceptance Test Plan (ATP)" }`): inline the full body under a `## Acceptance Test Plan (ATP)` heading so the content still lands somewhere readable.

```
[ISSUE_TRACKER_TOOL] Add Comment:
  issue: {STORY_KEY}
  body: |
    ## Acceptance Test Plan (ATP) — ready for pre-sprint review
    {@PO_HANDLE} {@DEV_LEAD_HANDLE}
    The ATP lives in the {{jira.acceptance_test_plan}} field.
    # FALLBACK ONLY (field absent): replace the pointer line above with the full staged refinement body.

    Action Required: review ambiguities, answer critical questions, confirm edge-case behavior, validate parametrization.
    AI Effort: {low | medium | high}
    Refined on: {{YYYY-MM-DD}} — QA Shift-Left batch session
    This ATP is refined in-sprint by /sprint-testing Stage 1, which creates the
    Test Plan issue from this field and refines it into the executable superset.
```

`test-documentation` mode `repair-traceability` checks the `{{jira.acceptance_test_plan}}` field, or this `## Acceptance Test Plan (ATP)` fallback comment when the field is absent.

When AI Effort is High, append the size note to the same comment. It is a warning only, and the Story still moves to Ready For Dev (template and worked example: `references/ai-effort-checklist.md`):

```markdown
### AI Effort: High (may need splitting)
Tipped by: {question numbers and one-line reason}.
Suggested slices (optional):
1. {slice 1, one sentence}
2. {slice 2, one sentence}
```

A PO may clone or split the Story and re-refine it, but that is optional and never a gate. The skill creates no child Stories, leaves the Story's scope as written, and keeps no separate split-verdict field: the AI Effort value plus this comment is the record. Whoever resolves a split may add one optional label (`split-accepted`, `split-edited` or `split-rejected`, see `references/ai-effort-checklist.md`), and a Story without one is valid. The transition in Step 5 still runs.

Mention rule: include `@PO_HANDLE` and `@DEV_LEAD_HANDLE` in the comment if those handles are available in `.agents/project.yaml`, and omit them otherwise. Mention spam is worse than no mention.

### Step 4: labels

```
[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {STORY_KEY}
  labels: +shift-left-reviewed, +shift-left-{{YYYY-MM-DD}}
```

- `shift-left-reviewed` is the soft marker. `/sprint-testing` Stage 1 reads it, but a marker is not evidence: the short-circuit also needs the published ATP body (`sprint-testing/references/acceptance-test-planning.md` §0.0).
- `shift-left-{{YYYY-MM-DD}}` is the freshness marker. `/sprint-testing` uses the date to decide whether the refinement is under 30 days old and can be short-circuited.

Both labels are appended and never replaced. If the Story already carries an older `shift-left-{date}`, leave it, because it documents the refinement timeline.

### Step 5: transition

> **Guardrail**: the Story never advances beyond `{{jira.status.story.ready_for_dev}}`. Sprint commitment and dev start belong to the PO and the dev lead.

Read the current status, then transition along the shortest valid path to `ready_for_dev`:

| Current status | Transitions to apply | Resolved IDs |
|----------------|----------------------|--------------|
| `{{jira.status.story.backlog}}` | `{{jira.transition.story.analyze}}` → `{{jira.transition.story.refined}}` | ids resolved from `.agents/jira-workflows.json` at run time, never hardcoded |
| `{{jira.status.story.shift_left_qa}}` | `{{jira.transition.story.refined}}` | id resolved from `.agents/jira-workflows.json` at run time, never hardcoded |
| `{{jira.status.story.ready_for_dev}}` | (none — already there) | — |
| any other non-terminal status past `{{jira.status.story.ready_for_dev}}` (per `.agents/jira-workflows.json`) | SKIP transition — log warning | refinement still lands; workflow untouched |
| `{{jira.status.story.aborted}}`, `{{jira.status.story.deployed_to_production}}` | SKIP transition + WARN user — terminal | refinement is informational only |

Pseudocode:

```
[ISSUE_TRACKER_TOOL] read status: {STORY_KEY}    # trivial status-only lookup — acli search OK
if status == backlog:
    [ISSUE_TRACKER_TOOL] Transition: {{jira.transition.story.analyze}}    # -> shift_left_qa
    [ISSUE_TRACKER_TOOL] Transition: {{jira.transition.story.refined}}   # -> ready_for_dev
elif status == shift_left_qa:
    [ISSUE_TRACKER_TOOL] Transition: {{jira.transition.story.refined}}   # -> ready_for_dev
elif status == ready_for_dev:
    # noop — already at target
elif status is past ready_for_dev (any later status in .agents/jira-workflows.json):
    log warning "Story past ready_for_dev — refinement landed; workflow untouched"
else:
    log warning "Unknown status {status}; SKIP transition"
```

The `back_from_shift_left_qa` transition is a PO and dev decision (the Story does not meet readiness for development and goes back to backlog), so the skill leaves it to them.

### Step 5b: close the `[QA] Shift-Left Review` subtask

Phase 1 found or created this subtask under the Story (assignee = self per `agentic-qa-core/references/artifact-lifecycle.md` §2), where Jira's `create` transition lands it in `{{jira.status.subtask.active}}`. The handoff closes it:

1. Locate the subtask under the Story by its exact title `[QA] Shift-Left Review`.
2. Post the exhaustive session annotations on the subtask first: the long analysis, refinement traces and per-phase notes that are too verbose for the Story. The Story keeps only its canonical outputs (refined ACs field, description section, ATP field, pointer comment, labels), and the subtask holds the full working trail.

```
[ISSUE_TRACKER_TOOL] Add Comment (or Update description):
  issue: {SUBTASK_KEY}
  body: <exhaustive session annotations — analysis trail, refinement traces>

[ISSUE_TRACKER_TOOL] Transition: {{jira.transition.subtask.complete}}   # active -> close
```

> **On an unmapped slug** (this project renamed the subtask statuses, or the catalog is
> stale): run the fallback protocol in `agentic-qa-core/references/artifact-lifecycle.md`
> §4. List the live transitions, propose the closest synonym in one `AskUserQuestion`,
> fire the live id on yes, and recommend `bun run jira:sync-workflows`. Always ask; a
> silent skip hides the mismatch.

3. If Phase 1 skipped subtask creation (no subtask work type in `.agents/jira-workflows.json`, or the project disallows subtasks), skip this step with a warning in the per-Story log. Subtask support never blocks the handoff.

### Step 6: verify trace

Both modalities are field-first, so there is no Test Plan item to trace before the sprint:

```
bun run jira:sync-issues get {STORY_KEY} --include-comments
# then read the synced field files + comments.md. Verify:
#   - acceptance_criteria field (or "## Acceptance Criteria" fallback comment) != empty
#   - field {{jira.acceptance_test_plan}} != empty
#     (or the "## Acceptance Test Plan (ATP)" fallback comment carries the full body
#      when the field is absent on this instance)
#   - handoff comment "## Acceptance Test Plan (ATP)" present and points to the field
#     (full body inline ONLY in fallback mode — field absent on this instance)
#   - "[QA] Shift-Left Review" subtask (when created) is at {{jira.status.subtask.close}}
```

### Step 6b: light stage verifier (closes the Shift-Left stage)

Run the light stage verifier template in `agentic-qa-core/references/artifact-lifecycle.md` §5. The stage-specific status lines are:

```
[ ] Story at {{jira.status.story.ready_for_dev}} — via analyze -> refined, and STOPPED there
    (a Story already past ready_for_dev keeps the refinement and skips the transition)
[ ] `{{jira.ai_effort}}` set (or the `## AI Effort` fallback comment posted); a High value carries
    the size note in the handoff comment
[ ] `[QA] Shift-Left Review` subtask at {{jira.status.subtask.close}} — via complete
    (stated N/A when the instance has no subtask work type)
[ ] Subtask assignee = self, set at create time
[ ] Any unmapped slug went through the §4 fallback (asked), never a silent skip
```

### Step 7: return the per-Story log

```json
{
  "story": "UPEX-100",
  "atp_container": "custom_field|fallback_comment",
  "subtask_key": "UPEX-205 (null when skipped — no subtask work type)",
  "subtask_status": "close|skipped",
  "light_verifier": "8/8 (N/A: <stated reasons>)",
  "description_appended": true,
  "comment_posted": true,
  "labels_added": ["shift-left-reviewed", "shift-left-2026-05-20"],
  "ai_effort": "low|medium|high",
  "split_proposed": false,
  "transitions_applied": ["analyze", "refined"],
  "final_status": "Ready For Dev",
  "trace_status": "ok|warning|fail",
  "warnings": [],
  "errors": []
}
```

Warnings do not abort the per-Story handoff. They surface in the batch report.

Errors abort. Per AGENTS.md §3 (Orchestration Mode), the orchestrator presents retry, skip or abort to the user. Jira mutations are not rolled back automatically: they stay in the partial log so a future session can resume.

---

## Batch report

Dispatched once, after every Story has run Phase 3.

### Output path

```
.session/shift-left-testing/<YYYY-MM-DD>-<descriptor>/batch-report.md
```

### Template

```markdown
# Shift-Left Batch Report — {{YYYY-MM-DD}}

## Session metadata
- **Session folder**: `.session/shift-left-testing/<YYYY-MM-DD>-<descriptor>/`
- **Mode**: Modality {A | B}
- **Candidate count**: {n}
- **Accepted for refinement**: {n}
- **Rejected (non-Story)**: {n}
- **Skipped (LOW risk)**: {n}
- **Already refined (skipped)**: {n}
- **Already refined (refreshed)**: {n}
- **Refined this session**: {n}

## Per-Story summary

| # | Story | Title | Risk | Gaps | Critical PO Qs | Tech Qs | Outlines | Data-feasibility flag | Final status | Trace |
|---|-------|-------|------|------|----------------|---------|----------|----------------------|--------------|-------|
| 1 | UPEX-100 | Add OTP login | HIGH | 4 | 2 | 3 | 12 | — | Ready For Dev | ok |
| 2 | UPEX-101 | Refund partial amount | HIGH | 6 | 3 | 2 | 14 | DATA-FEASIBILITY | Ready For Dev | warning |
| 3 | UPEX-102 | Filter orders by status | MEDIUM | 2 | 0 | 1 | 6 | — | Ready For Dev | ok |

## Aggregated Critical Questions for PO (deduped)

Top questions across the batch, ranked by how many Stories they block:

1. **Q: What is the refund cap policy — % of original or hard limit?**
   - Blocks: UPEX-101, UPEX-118 (2 Stories)
   - Suggested action: PO decision required before sprint planning.
2. **Q: What is the session expiry threshold for OTP flow?**
   - Blocks: UPEX-100 (1 Story)
   - Suggested action: PO + Security decision; default-safe = 5 minutes.

## Aggregated Technical Questions for Dev (deduped)

1. **Q: Which Auth0 SDK version is pinned?**
   - Blocks: UPEX-100, UPEX-114 (2 Stories)
2. ...

## Risk distribution

| Level | Count | Stories |
|-------|-------|---------|
| HIGH | 2 | UPEX-100, UPEX-101 |
| MEDIUM | 1 | UPEX-102 |
| LOW (skipped) | 1 | UPEX-117 |

## Data feasibility blockers

Stories flagged with `DATA-FEASIBILITY-RISK` during selection that still carry the flag post-refinement:

| Story | Blocker | Required pre-work |
|-------|---------|-------------------|
| UPEX-101 | Refund-history fixture missing in staging | Backend team to seed; ETA: ? |

## Recommended sprint-planning order

Sorted by risk + dependency:

1. **UPEX-100** — HIGH, no dependencies, refinement clean → ready for sprint planning
2. **UPEX-101** — HIGH but data-feasibility flag → plan after pre-work confirmed
3. **UPEX-102** — MEDIUM → can wait, low coupling

## Next steps

- [ ] PO answers Aggregated Critical Questions before sprint planning
- [ ] Dev lead answers Aggregated Tech Questions before the Story is pulled into a sprint
- [ ] Every Story with AI Effort High carries the size note (a warning: the split is optional and never a gate)
- [ ] When each Story reaches `Ready For QA`, run `/sprint-testing` — Stage 1 short-circuits Phases 1-3 of `acceptance-test-planning.md` when the fresh `shift-left-*` labels AND the published ATP body are both there (§0.0)
- [ ] If any Story still carries a data-feasibility blocker at sprint-planning time, consider moving it to a later sprint
```

### Posting rules

1. Always write the file under `.session/shift-left-testing/<YYYY-MM-DD>-<descriptor>/batch-report.md`.
2. If all refined Stories share one parent epic, post the batch report as a comment on that epic. The team grooms by epic, so the report lands where decision-makers look.
3. If the Stories span several epics or have no common parent, post to no epic and deliver the report inline to the user as the session-closing message.
4. Post the report once, never on every Story. The per-Story handoff comment already landed in Step 3, and the batch report is a session-level artifact.

---

## Resume protocol

The session is resumable. After an interruption (subagent failure, user abort, network drop), the next invocation:

1. Reads the session's `progress.md` (`.session/shift-left-testing/<batch-id>/`) to learn which Stories are pending and which are handed off.
2. Reads each pending Story's `shift-left-refinement.md` (if it exists) to learn that the refinement is done.
3. Continues from the first incomplete step (Step 1 if the description is not yet updated, Step 2 if the ATP is not populated, and so on).

Each step is idempotent:

| Step | Idempotency rule |
|------|------------------|
| Step 1 description | If "QA Refinements (Shift-Left Analysis)" section already present → skip |
| Step 2 ATP field | Overwrite OK — field is single-value |
| Step 2b AI Effort | Overwrite only a value this skill wrote; keep a human-set value |
| Step 3 comment | If a comment headed `## Acceptance Test Plan (ATP)` already exists → skip |
| Step 4 labels | acli labels operation is set-based; re-running adds nothing |
| Step 5 transition | Read current status before transitioning; skip if already at target |
| Step 5b subtask | Find by exact title (created in Phase 1); skip transition if already `{{jira.status.subtask.close}}`; append annotations as a new comment, never overwrite |
| Step 6 trace | Always re-verify |

---
