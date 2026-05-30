# Handoff Protocol — Phase 3 (Per-Story Jira Mutation + Batch Report)

> **Subagent context**: this file is the "Context docs" reference for the Phase 3 Handoff subagent + Batch Report subagent (see `shift-left-testing/SKILL.md` §Subagent Dispatch Strategy and §Phase 3). Owns Jira mutations + final report only — refinement content comes from `atp-draft-template.md` and the per-Story `shift-left-refinement.md`.

The Handoff subagent runs ONCE PER REFINED STORY. The Batch Report subagent runs ONCE PER SESSION at the end. Both are dispatched sequentially.

This reference defines:
1. Per-Story Jira mutation sequence (description update, ATP DRAFT field, comment mirror, labels, transition, trace verify).
2. Branching per TMS modality.
3. Transition guardrails (stop at `estimation`).
4. Batch report template + epic-comment posting rules.

---

## Inputs (per Story)

| Input | Source |
|-------|--------|
| Refined refinement file (NON-Jira working file) | `.context/PBI/epics/EPIC-<EPIC_KEY>-<slug>/stories/STORY-<STORY_KEY>-<slug>/shift-left-refinement.md` |
| Current Story status | `bun run jira:sync-issues get {STORY_KEY}`, then read synced status (or `acli search` for the trivial status-only lookup) |
| Current Story labels | Same synced read — labels list |
| Modality | From `session-memory.md` (resolved in shift-left-testing Phase 0.1) |
| TMS field map | `.agents/jira-fields.json` → `{{jira.acceptance_criteria}}`, `{{jira.acceptance_test_plan}}` |
| Workflow transitions | `.agents/jira-workflows.json` → `{{jira.transition.story.analyze}}`, `{{jira.transition.story.estimate}}` |

---

## Per-Story handoff sequence

> **Prerequisite**: `/acli` skill loaded (Phase 0.2). In Modality jira-xray with Test Plan opt-in, also `/xray-cli`.

### Step 1a — Write refined ACs to the Jira `acceptance_criteria` field

The refined Acceptance Criteria are CANONICAL and belong in the dedicated Jira field — Jira is source of truth; the local `acceptance-criteria.md` is a read-only cache produced by the sync. NEVER hand-write that file.

```
[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {STORY_KEY}
  fields:
    {{jira.acceptance_criteria}}: <Refined ACs — Phase 3 of shift-left-refinement.md verbatim>
```

FALLBACK (field absent on this instance): post the refined ACs as a structured comment headed `## Acceptance Criteria`, per `.agents/jira-required.yaml` → `acceptance_criteria.fallback` (`{ target: comment, label: "Acceptance Criteria" }`). Never block.

After writing, run `bun run jira:sync-issues get {STORY_KEY} --include-comments` and read back the synced `acceptance-criteria.md` to confirm the field (or fallback comment) landed.

### Step 1b — Append supporting analysis to Story description

Append a "QA Refinements (Shift-Left Analysis)" section to the Story description. The section body is a CONDENSED extract of the SUPPORTING analysis from `shift-left-refinement.md` (refined ACs themselves live in the `acceptance_criteria` field from Step 1a) — full body goes into the ATP custom field (Step 2) and comment mirror (Step 3). Description should be readable in the Jira UI without scrolling forever.

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

> Full refinement (Phases 1-5, outline DRAFT, risk + data feasibility) lives in the ATP DRAFT custom field and the canonical comment below.
```

```
[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {STORY_KEY}
  description: <existing description + "\n\n" + QA Refinements section>
```

The Handoff subagent must read the current description FIRST (from the synced `.md`), then append. Never overwrite.

### Step 2 — Populate ATP DRAFT

Branch on modality (resolved in Phase 0.1).

#### Modality jira-xray — Xray (Test Plan opt-in CHOSEN by user)

```
[TMS_TOOL] Create TestPlan:
  project: {{PROJECT_KEY}}
  title: "Test Plan (Shift-Left DRAFT): {{PROJECT_KEY}}-{n}"
  description: <full shift-left-refinement.md body>

[ISSUE_TRACKER_TOOL] Link Issues:
  linkType: "tests"
  outward: {ATP_KEY}
  inward:  {STORY_KEY}
```

Then ALSO populate the custom field on the Story so the field+comment mirror works the same as Modality jira-native:

```
[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {STORY_KEY}
  fields:
    {{jira.acceptance_test_plan}}: <full shift-left-refinement.md body>
```

#### Modality jira-xray — Xray (Test Plan opt-in NOT chosen — default)

OR Modality jira-native:

```
[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {STORY_KEY}
  fields:
    {{jira.acceptance_test_plan}}: <full shift-left-refinement.md body>
```

Custom-field write may fail in Modality jira-xray if the Jira instance has not provisioned `{{jira.acceptance_test_plan}}`. Fall back to comment-only mode and warn the user in the per-Story summary.

### Step 3 — Handoff notification + fallback comment

Jira is the source of truth: the ATP DRAFT lives in the `{{jira.acceptance_test_plan}}` field (Step 2) — do NOT mirror it into a comment when the field exists. Post ONE handoff comment on the Story:

- **Field present (default)**: a SHORT notification — the ATP DRAFT is ready for review in the `{{jira.acceptance_test_plan}}` field. Do NOT paste the full body.
- **FALLBACK — only if `{{jira.acceptance_test_plan}}` is absent on this instance** (per `.agents/jira-required.yaml` → `acceptance_test_plan.fallback`, `{ target: comment, label: "Acceptance Test Plan (ATP)" }`): inline the full body under a `## Acceptance Test Plan (ATP)` heading so the content still lands somewhere readable.

```
[ISSUE_TRACKER_TOOL] Add Comment:
  issue: {STORY_KEY}
  body: |
    ## Acceptance Test Plan (ATP) — Shift-Left DRAFT ready for review
    {@PO_HANDLE} {@DEV_LEAD_HANDLE}
    The ATP DRAFT lives in the {{jira.acceptance_test_plan}} field.
    # FALLBACK ONLY (field absent): replace the pointer line above with the full shift-left-refinement.md body.

    Action Required: review ambiguities, answer critical questions, confirm edge-case behavior, validate parametrization.
    Refined on: {{YYYY-MM-DD}} — QA Shift-Left batch session
    Local working copy: .context/PBI/epics/EPIC-<EPIC_KEY>-<slug>/stories/STORY-{STORY_KEY}-<slug>/shift-left-refinement.md
```

`fix-traceability` checks the `{{jira.acceptance_test_plan}}` field, or this `## Acceptance Test Plan (ATP)` fallback comment when the field is absent.

Mention rule: include `@PO_HANDLE` and `@DEV_LEAD_HANDLE` in the comment IF those handles are available in `.agents/project.yaml`. Otherwise omit — mention-spam is worse than no mention.

### Step 4 — Labels

```
[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {STORY_KEY}
  labels: +shift-left-reviewed, +shift-left-{{YYYY-MM-DD}}
```

- `shift-left-reviewed` is the SOFT MARKER — `/sprint-testing` Stage 1 reads it.
- `shift-left-{{YYYY-MM-DD}}` is the FRESHNESS MARKER — `/sprint-testing` uses the date to decide whether refinement is still <30 days old and can be short-circuited.

Both labels are appended (never replaced). If the Story already carries an older `shift-left-{date}`, leave it — it documents the refinement timeline.

### Step 5 — Transition

> **Guardrail**: NEVER advance beyond `{{jira.status.story.estimation}}`. PO + Dev lead own `estimate -> ready_for_dev`.

Read current status, then transition along the shortest valid path to `estimation`:

| Current status | Transitions to apply | Resolved IDs |
|----------------|----------------------|--------------|
| `{{jira.status.story.backlog}}` | `{{jira.transition.story.analyze}}` → `{{jira.transition.story.estimate}}` | id 2 (Analyze), then id 3 (Estimate) |
| `{{jira.status.story.shift_left_qa}}` | `{{jira.transition.story.estimate}}` | id 3 (Estimate) |
| `{{jira.status.story.estimation}}` | (none — already there) | — |
| `{{jira.status.story.ready_for_dev}}`, `{{jira.status.story.in_progress}}`, `{{jira.status.story.in_review}}`, `{{jira.status.story.ready_for_qa}}`, ... | SKIP transition — log warning | refinement still lands; workflow untouched |
| `{{jira.status.story.aborted}}`, `{{jira.status.story.deployed_to_production}}` | SKIP transition + WARN user — terminal | refinement is informational only |

Pseudocode:

```
[ISSUE_TRACKER_TOOL] read status: {STORY_KEY}    # trivial status-only lookup — acli search OK
if status == backlog:
    [ISSUE_TRACKER_TOOL] Transition: {{jira.transition.story.analyze}}    # -> shift_left_qa
    [ISSUE_TRACKER_TOOL] Transition: {{jira.transition.story.estimate}}   # -> estimation
elif status == shift_left_qa:
    [ISSUE_TRACKER_TOOL] Transition: {{jira.transition.story.estimate}}   # -> estimation
elif status == estimation:
    # noop — already at target
elif status in (ready_for_dev, in_progress, in_review, ready_for_qa, qa_approved, in_test, ready_for_release, deployed_to_production, blocked, aborted):
    log warning "Story past estimation — refinement landed; workflow untouched"
else:
    log warning "Unknown status {status}; SKIP transition"
```

The skill NEVER applies the `back_from_shift_left_qa` transition automatically. That is a PO / Dev decision (Story does not meet readiness for estimation — go back to backlog).

### Step 6 — Verify trace

Modality jira-xray:

```
[TMS_TOOL] trace {STORY_KEY}
# Verify: Test Plan link present, Test Plan description matches shift-left-refinement.md body
```

Modality jira-native:

```
bun run jira:sync-issues get {STORY_KEY} --include-comments
# then read the synced field files + comments.md. Verify:
#   - acceptance_criteria field (or "## Acceptance Criteria" fallback comment) != empty
#   - field {{jira.acceptance_test_plan}} != empty
#   - last comment body starts with "=== Shift-Left Refinement:"
#   - field body == comment body (after stripping the "=== Shift-Left Refinement: ===" header and footer)
```

### Step 7 — Return per-Story log

```json
{
  "story": "UPEX-100",
  "atp_container": "test_plan|custom_field",
  "atp_key": "UPEX-201 (only Modality jira-xray with Test Plan opt-in)",
  "description_appended": true,
  "comment_posted": true,
  "labels_added": ["shift-left-reviewed", "shift-left-2026-05-20"],
  "transitions_applied": ["analyze", "estimate"],
  "final_status": "Estimation",
  "trace_status": "ok|warning|fail",
  "warnings": [],
  "errors": []
}
```

Warnings DO NOT abort the per-Story handoff — they are surfaced in the batch report.

Errors DO abort. Per CLAUDE.md §Orchestration Mode, the orchestrator presents retry / skip / abort to the user. Do NOT auto-rollback Jira mutations — they are recorded in the partial log so a future session can resume.

---

## Batch report

Dispatched ONCE after every Story has run Phase 3.

### Output path

```
.context/PBI/shift-left-sessions/{{YYYY-MM-DD}}-{suffix?}/batch-report.md
```

### Template

```markdown
# Shift-Left Batch Report — {{YYYY-MM-DD}}

## Session metadata
- **Session folder**: `.context/PBI/shift-left-sessions/{{YYYY-MM-DD}}-{suffix?}/`
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
| 1 | UPEX-100 | Add OTP login | HIGH | 4 | 2 | 3 | 12 | — | Estimation | ok |
| 2 | UPEX-101 | Refund partial amount | HIGH | 6 | 3 | 2 | 14 | DATA-FEASIBILITY | Estimation | warning |
| 3 | UPEX-102 | Filter orders by status | MEDIUM | 2 | 0 | 1 | 6 | — | Estimation | ok |

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

1. **UPEX-100** — HIGH, no dependencies, refinement clean → ready for estimation
2. **UPEX-101** — HIGH but data-feasibility flag → estimate after pre-work confirmed
3. **UPEX-102** — MEDIUM → can wait, low coupling

## Next steps

- [ ] PO answers Aggregated Critical Questions before sprint planning
- [ ] Dev lead answers Aggregated Tech Questions before estimation
- [ ] When each Story reaches `Ready For QA`, run `/sprint-testing` — Stage 1 will detect `shift-left-reviewed` label and short-circuit Phases 1-3 of `acceptance-test-planning.md`
- [ ] If any Story still carries a data-feasibility blocker at sprint-planning time, consider moving it to a later sprint
```

### Posting rules

1. **Always write** the file under `.context/PBI/shift-left-sessions/{{YYYY-MM-DD}}-{suffix?}/batch-report.md`.
2. **If all refined Stories share ONE parent epic**, post the batch report as a comment on that epic — the team grooms by epic, so the report lands where decision-makers look.
3. **If Stories span multiple epics or have no common parent**, do NOT post to any epic — deliver inline to the user as the session-closing message.
4. **Never post the report on every Story**. The per-Story comment is already mirrored in Step 3; the batch report is a session-level artifact.

---

## Resume protocol

The session is resumable. If interrupted (subagent failure, user abort, network drop), the next invocation:

1. Reads `session-memory.md` to know which Stories are pending vs handed-off.
2. Reads each pending Story's `shift-left-refinement.md` (if it exists) to know Phase 2 is done.
3. Continues from the first incomplete step (Step 1 if description not yet updated, Step 2 if ATP not populated, ...).

Each step is idempotent:

| Step | Idempotency rule |
|------|------------------|
| Step 1 description | If "QA Refinements (Shift-Left Analysis)" section already present → skip |
| Step 2 ATP field | Overwrite OK — field is single-value |
| Step 2 Test Plan create (Modality jira-xray) | Search by title before creating — link existing if found |
| Step 3 comment | If a comment matching `=== Shift-Left Refinement: {STORY_KEY} ===` exists → skip |
| Step 4 labels | acli labels operation is set-based; re-running adds nothing |
| Step 5 transition | Read current status before transitioning; skip if already at target |
| Step 6 trace | Always re-verify |

---

## Gotchas

1. **Description append, never overwrite.** Read first, append second.
2. **Custom field + comment must be byte-for-byte mirrors.** `fix-traceability` checks this. Diff = traceability error.
3. **Transition guardrail.** STOP at `estimation`. Stories past that point keep the refinement (description + field + comment + labels) but skip transition.
4. **Test Plan opt-in is asked ONCE per session in Phase 0**, not per Story.
5. **Mention discipline.** Only mention PO/Dev-lead handles that are explicitly listed in `.agents/project.yaml`. No guessing.
6. **Dated label** (`shift-left-{date}`) is APPENDED on every refinement. `/sprint-testing` reads the most recent one. Old dated labels are NOT pruned by this skill.
7. **Resume safety.** Every step is idempotent — re-running a partially-completed Story should converge to the same final state.
8. **Language**: all Jira content English. Mirror user's language only in conversation. CLAUDE.md §1 Rule #14.
9. **NO git commit.** Jira is the source of truth. The local `shift-left-refinement.md` is a gitignored working artifact.
10. **Epic comment posting** is a courtesy. If it fails (epic doesn't exist, permission denied, network), DO NOT abort — log a warning and proceed; the local report is still authoritative.

---

## Checklist before closing the session

- [ ] All accepted Stories ran the per-Story handoff
- [ ] Each per-Story log captured in `session-memory.md`
- [ ] No transition advanced beyond `{{jira.status.story.estimation}}`
- [ ] Batch report written to `.context/PBI/shift-left-sessions/{{YYYY-MM-DD}}-{suffix?}/batch-report.md`
- [ ] Batch report posted to parent epic (if all Stories share one) OR delivered inline
- [ ] User informed: when each Story reaches `Ready For QA`, run `/sprint-testing` (short-circuit thanks to `shift-left-reviewed`)
- [ ] Warnings + errors surfaced explicitly in the user-facing session-close message
