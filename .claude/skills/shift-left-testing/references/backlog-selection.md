# Backlog Selection — Phase 1 Triage

> **Subagent context**: this file is part of the "Context docs" briefing component for the Phase 1 Selection subagent (see `shift-left-testing/SKILL.md` §Subagent Dispatch Strategy). Owns the candidate-resolution + triage rubric only — refinement itself lives in `refinement-playbook.md`.

Decides which Backlog Stories deserve a Shift-Left refinement pass and at what depth. The output is a ranked, user-facing candidate table that the orchestrator presents BEFORE Phase 2 dispatches refinement subagents.

This reference is for **pre-sprint batch grooming**. It does NOT cover in-sprint triage (that lives in `sprint-testing/references/acceptance-test-planning.md` §Phase 0) nor bug triage (bugs are out of scope for this skill).

---

## Inputs

| Input | Source |
|-------|--------|
| Candidate Story IDs (explicit mode) | User argument: `UPEX-100,101,102` or natural-language list |
| Candidate Story IDs (JQL mode) | `[ISSUE_TRACKER_TOOL]` search using the query in §JQL Query below |
| Story metadata | `[ISSUE_TRACKER_TOOL]` per-Story fetch: title, description, ACs, priority, type, labels, sprint, parent epic, last-updated, comments count |
| Project-wide context | `.context/business/business-data-map.md`, `.context/business/business-feature-map.md`, `.context/business/business-api-map.md`, `.context/master-test-plan.md` |
| Jira workflow values | `.agents/jira-workflows.json` -> `{{jira.status.story.*}}` |

---

## JQL Query (for "groom the backlog" mode)

```jql
project = {{PROJECT_KEY}}
AND issueType = Story
AND status in (
  "{{jira.status.story.backlog}}",
  "{{jira.status.story.shift_left_qa}}",
  "{{jira.status.story.estimation}}",
  "{{jira.status.story.ready_for_dev}}"
)
ORDER BY priority DESC, created DESC
```

Optional filters the user may layer on:

| Filter | When |
|--------|------|
| `AND sprint in openSprints()` | "Next sprint candidates only" |
| `AND "Epic Link" = <<EPIC_KEY>>` | Grooming one epic at a time (epic key supplied by the user at session start) |
| `AND labels != "shift-left-reviewed"` | "Skip already-refined" — but PREFER surfacing those separately and letting the user decide (see §3 below) |
| `AND updated >= -14d` | Recent additions only |

The Selection subagent proposes the JQL, executes it via `[ISSUE_TRACKER_TOOL]`, and surfaces the result count to the user BEFORE Phase 1 triage starts. If the result set is > 12 Stories, recommend splitting into multiple sessions.

---

## Step 1 — Type filter (hard)

For each fetched candidate:

| Issue type | Action |
|------------|--------|
| Story | -> Step 2 |
| Bug, Spike, Sub-task, Tech-debt, Task, Epic | REJECT. Surface with one-line reason. Do NOT silently drop. |

Reason surfaced to user:

```
Rejected (non-Story):
  - UPEX-115 [Bug] — Shift-Left is reactive-defect-free; this skill only refines forward-looking ACs.
  - UPEX-127 [Spike] — Spikes have no implementable ACs; refine the follow-up Story instead.
  - UPEX-141 [Tech-debt] — No user-facing AC; convert to a Story first if needed.
```

---

## Step 2 — Label freshness check

For each surviving candidate, check labels:

| Label state | Bucket | Default action |
|-------------|--------|----------------|
| No `shift-left-reviewed` | NEW | -> Step 3 (triage) |
| Has `shift-left-reviewed`, dated label `shift-left-{date}` < 30 days old | RECENTLY REFINED | Surface separately. Default: skip. Ask user: "Refresh anyway?" |
| Has `shift-left-reviewed`, dated label > 30 days OR missing | STALE | Surface separately. Default: re-refine (Story may have drifted). Ask user: "Refresh or skip?" |

This step prevents accidental double-work and gives the user explicit control over re-refinement.

---

## Step 3 — Veto table (beats risk score)

Apply before scoring. Same rubric as `acceptance-test-planning.md` §0.1 — duplicated here for the subagent's convenience but the source of truth is the sprint-testing reference.

### SKIP REFINEMENT (drop from refinement set, log reason)

| Condition | Why |
|-----------|-----|
| Backend-only with no UI surface AND no API contract change | No user-observable behavior to refine |
| Pure CSS / styling | No AC complexity to refine |
| Static copy / documentation | No business logic |
| Tech-debt refactor with zero behavior change | No AC change |
| DB-only setup with no business logic | No external surface |

### FORCE FULL REFINEMENT (override score)

| Condition | Why |
|-----------|-----|
| Money, billing, payment, refund, currency conversion | Calculation correctness + audit trail |
| Data integrity on core entities (user, account, order, transaction) | Persistent state corruption risk |
| Authentication / authorization / session / RBAC | Security perimeter |
| External integrations (Stripe, Auth0, Salesforce, partner APIs) | Contract drift risk |
| State machines (order lifecycle, subscription, dispute, kyc) | Transition validity matters |
| Calculations / formulas (tax, discount, accrual, interest) | Precision matters |

If veto fires, write the reason into the candidate row and skip Step 4.

---

## Step 4 — Risk score (only if no veto)

| Factor | Score | Condition |
|--------|-------|-----------|
| New feature | +3 | New functionality vs modification |
| Dynamic data (API / DB) | +3 | Not hardcoded / static |
| Explicit ACs present | +2 | Acceptance criteria defined in the Story |
| User-facing | +2 | Affects UI or visible behavior |
| High effort | +2 | Story-point estimate >= 5 OR description >= 600 words |
| High priority | +1 | Priority High or Critical |
| Multi-component | +1 | Multiple codebase areas touched (frontend + backend, multiple services) |
| External dependency | +1 | Mentions third-party API, library upgrade, partner integration |
| AC-light flag | +2 | < 2 ACs present OR ACs are 1-line each (auto-detected) — likely needs the most refinement |
| Comment activity | +1 | > 5 substantive comments — usually means team disagreement still unresolved |

| Score | Level | Recommendation |
|-------|-------|----------------|
| 0-3 | LOW | SKIP — PO / Dev can write ACs without QA refinement |
| 4-7 | MEDIUM | Standard refinement (`acceptance-test-planning.md` §Phases 1-3 + outline-only Phase 4) |
| 8+ | HIGH | Extended refinement — emphasize Phase 2 (ambiguities + edge cases not in story); produce extended PO/Dev question set |

---

## Step 5 — Data feasibility scan (lightweight, optional)

For HIGH-risk candidates only, the Selection subagent does a quick feasibility probe:

- Read `business-data-map.md` and `business-api-map.md`. Does the data model support the Story's ACs?
- Read `master-test-plan.md`. Are there test-data fixtures for this entity / flow?
- If neither answers "yes", flag the candidate with a `DATA-FEASIBILITY-RISK` marker. The refinement subagent will surface this as a critical PO question in Phase 2.

This is a LIGHT scan — NO DB queries, NO API calls. The skill does not execute. Feasibility is established by reading the context docs only.

---

## Output format — candidate table presented to the user

The Selection subagent returns this table verbatim. The orchestrator pastes it into the conversation and waits for the user's OK.

```
# Shift-Left Candidate Triage — {{YYYY-MM-DD}}

## Accepted for refinement ({n})

| # | Story | Title | Priority | Type | Risk | Score | Veto override | Data-feasibility | Notes |
|---|-------|-------|----------|------|------|-------|---------------|------------------|-------|
| 1 | UPEX-100 | Add OTP login | High | Story | HIGH | 11 | auth perimeter | OK | extended scan |
| 2 | UPEX-101 | Refund partial amount | Medium | Story | HIGH | 9 | money | DATA-FEASIBILITY-RISK | flag for PO |
| 3 | UPEX-102 | Filter orders by status | Low | Story | MEDIUM | 6 | — | OK | standard |

## Rejected (non-Story) ({n})

| # | ID | Type | Reason |
|---|----|------|--------|
| 1 | UPEX-115 | Bug | Shift-Left skill scope = Stories only |

## Skipped — LOW risk ({n})

| # | Story | Title | Score | Reason |
|---|-------|-------|-------|--------|
| 1 | UPEX-117 | Add tooltip to footer | 2 | Pure UI copy — PO can write the AC directly |

## Already Shift-Left Reviewed ({n})

| # | Story | Title | Refined on | Last-updated | Suggested action |
|---|-------|-------|------------|--------------|------------------|
| 1 | UPEX-098 | Search by phone | 2026-04-30 (12d ago) | 2026-05-15 | Refresh? (post-refinement edits detected) |

## Recommended order for refinement

1. UPEX-100 — HIGH risk, auth perimeter, no dependencies
2. UPEX-101 — HIGH risk + data-feasibility flag, surface to PO first
3. UPEX-102 — MEDIUM, can wait

## Open questions before Phase 2 starts

- Confirm rejected set is correct? (1 item)
- Confirm refresh decision on "Already Refined" set? (1 item)
- Confirm refinement order above? (or override)
```

The user replies with OKs or overrides. The orchestrator persists the FINAL accepted list into `session-memory.md` before dispatching Phase 2 refinement subagents.

---

## Gotchas

1. **Non-Story rejection is loud, not silent.** Surfacing them is the value — the user often discovers that what they thought was a Story is actually a Bug or Tech-debt mislabeled.
2. **Refresh detection.** If a Story has `shift-left-reviewed` but its description changed after the dated label, that is a signal the original refinement is stale. Surface it.
3. **JQL result-set sanity.** > 12 Stories in a single session burns user attention. Suggest splitting (e.g. by epic, by priority, by sprint candidate). 1-12 is the practical sweet spot.
4. **Data-feasibility-risk is a SOFT flag**. It does not block — it surfaces a critical PO question in Phase 2. The Story still enters refinement.
5. **Score is advisory, not authoritative.** The user can override LOW skips into the refinement set if they smell hidden complexity.
6. **No execution.** The Selection subagent does NOT run smoke tests, DB queries, or API calls. Feasibility is established from `.context/business/*` reads only.

---

## Checklist before handing the table to the user

- [ ] Candidates resolved (explicit IDs or JQL)
- [ ] Type filter applied; rejected set logged with reasons
- [ ] Label freshness checked; recently-refined and stale-refined surfaced separately
- [ ] Veto applied per surviving candidate (table source of truth)
- [ ] Risk score computed per non-veto candidate
- [ ] Data-feasibility scan run for HIGH-risk candidates (light, doc-only)
- [ ] Output table assembled per §Output format
- [ ] Open questions enumerated at the bottom of the table
