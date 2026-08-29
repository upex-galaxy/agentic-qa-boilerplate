# Stage Gates — Definition-of-Done per workflow stage

> Shared doctrine cited by every workflow skill's `## Subagent Dispatch Strategy`.
> Companion to `briefing-template.md` (the 7-component dispatch) and
> `session-management.md` (the per-stage progress checkpoint). Where the briefing
> says *what to send a subagent* and session-management says *how to record that
> it ran*, this file says **what must be TRUE before the orchestrator advances to
> the next stage or hands off.**

## The gate rule

A workflow stage is **not done because its subagent returned** — it is done when
its **Definition of Done (DoD)** is satisfied. The orchestrator (main thread):

1. Names the stage's DoD in the dispatch briefing (component 6, "Report format")
   so the subagent reports *against the checklist*, not free-form.
2. On return, **verifies each DoD item** against the subagent's report + the
   artifacts on disk before appending the `status: completed` checkpoint to
   `progress.md` and advancing.
3. If any DoD item is unmet → the stage is **NEEDS REVISION**: re-dispatch with
   the gap named, or surface a blocker. Never advance on a partial stage.

DoD items are **observable** (a file exists, a link resolves, a checklist line is
answered YES or a justified N/A) — not vibes. "N/A" is a valid answer only when
*stated*, never when skipped.

> Planning/design stages additionally run the **Test-Design Checklist** from
> `test-design-doctrine.md` §"Part 3" as part of their DoD — that is the gate that
> the 5 principles + technique triggers were actually applied (1:N, EP, BVA,
> State-Transition, Decision Table, Pairwise, risk-beyond-AC).

---

## Per-stage DoD checklists

### shift-left-testing — per-Story refinement

```
[ ] Refined ACs written as Given/When/Then with specific data
[ ] Gaps / ambiguities / edge-cases-not-in-story surfaced as PO/Dev questions
[ ] Test-Design Checklist applied: each non-trivial AC exploded to outlines by
    technique (EP/BVA/State-Transition/Decision-Table/Pairwise) or a stated
    `trivially atomic` justification
[ ] Coverage estimate reflects the real 1:N (not a minimized count)
[ ] Inferred scenarios marked NEEDS PO/DEV CONFIRMATION
[ ] NO TMS test entities created (outlines only); label + transition applied
```

### sprint-testing — Stage 1 Planning

```
[ ] ATP authored as a **Test Plan** item (`ATP: {STORY-KEY}: {title}`), find-or-created FROM the
    Story's `{{jira.acceptance_test_plan}}` field content (shift-left is field-first — pre-sprint
    the ATP lives ONLY in the field; the item is born here); Story custom field only as fallback
[ ] xray — Set-first order honored: the Story's **ATS** (`ATS: {US_ID}: {story title}`, mandatory
    even with 1 TC; parent QA Test Artifacts; components inherited from the Story) created/updated
    holding ALL the Story's TCs, linked ATS→Story via the `test` slug (THE coverage link); the
    ATP's and the ATR's test lists DERIVED from the ATS membership — never independent id lists
[ ] **ATR carries the Test Environment** resolved from `active_env` in `.agents/project.yaml`
    (or the session env switch) — NO ATR without environment: an environment-less Execution is a
    DoD failure, re-dispatch (hard gate)
[ ] Coverage = two axes: AC-conformance (floor) + risk-beyond-AC, both present
[ ] Test-Design Checklist applied (techniques fired per AC shape; collapses justified)
[ ] Bug: veto + risk-score decision tree applied before the ATP; xray plans ONE repro Test by
    default, created at fix-verification time (1:N only if the scope genuinely covers distinct
    conditions — justified per test-design-doctrine)
[ ] TC timing honored: native → outlines only; xray → Tests created+ready to execute
    (NO persistent regression set assumed here)
[ ] Sprint altitude: the sprint **STP** (`STP: Sprint#{N}: {objective}`, Test Plan item, parent
    QA Master Test Plan) is found-or-created on the sprint's FIRST ticket and updated on every
    later ticket — skip-with-a-stated-note ONLY when the `Test Plan` work type is absent from the
    instance (there is NO field fallback at sprint altitude)
```

### sprint-testing — Stage 2 Execution

```
[ ] Smoke pass run first (Go/No-Go) before deep exploration
[ ] Planned outlines executed AND exploration probed beyond them
[ ] Newly-discovered partition/boundary/transition folded back into the outline set
[ ] Evidence captured under the PBI folder; outline/Test status updated
[ ] Bugs filed with story + AC traceability where found
```

### sprint-testing — Stage 3 Reporting

```
[ ] ATR authored as a **Test Execution** item (`ATR: {STORY-KEY}: Story Testing`); Story custom field only as fallback
[ ] QA comment posted; ticket transitioned to the correct status
[ ] Regression follow-up noted for any regression-worthy bug (Stage-4 hand-off); bug retest (xray):
    repro Test's run recorded PASSED/FAILED in the retest Execution
[ ] Traceability verified — xray: Story↔ATS (`test` slug, coverage) + ATS membership complete +
    Story↔ATP / Story↔ATR (administrative); native: field/comment containers populated
```

### sprint-testing — Sprint close (batch close, or `/regression-testing` if it arrives first)

```
[ ] The sprint **STR** (`STR: Sprint#{N}: Regression Testing`, Test Execution item, parent
    QA Test Artifacts) exists — first-to-arrive creates it, the other completes it
[ ] The STR carries its **Test Environment** (same hard gate as the ATR): no environment → DoD failure
[ ] The STR links to the sprint STP via the `testPlan` edge (`STR → STP`); the STP is closed out
    with its final scope/progress and transitioned to its terminal state
[ ] Skip-with-a-stated-note ONLY when the `Test Plan` / `Test Execution` work types are absent
    (no field fallback at sprint altitude) — never a silent skip
```

### test-documentation — Analyze / Prioritize / Document

```
Analyze:
[ ] Behavior is already-validated (not exploration); source-code validated
[ ] Candidate scenarios derived by technique (1:N), cross-cutting deferral explicit
Prioritize:
[ ] ROI applied → each scenario is exactly one of Candidate / Manual / Deferred
[ ] Most scenarios Deferred (re-apply Phase 0 if >50% land Candidate/Manual)
[ ] Bug-driven: golden rule applied (regression-worthy bug reuses/creates a Test)
Document:
[ ] Persist ONLY regression-worthy (Candidate/Manual); Deferred = report only,
    no TMS TC (native) / unpromoted sprint Test (xray)
[ ] US ↔ ATS ↔ ATP ↔ ATR ↔ TC links created — the **ATS→Story** `test` edge is the coverage one
    (a direct TC→Story link is the last-resort substitute when no ATS can exist); promoted TCs
    added to the Story's ATS + the Test Plan (xray) or feature/Epic label (native)
```

### test-automation — Plan / Code / Review

```
Plan:
[ ] Only Candidate verdicts in scope; spec.md derives ATCs by technique (1:N)
[ ] Test-Design Checklist applied (BVA where ranges exist; EP partitions distinct)
Code:
[ ] KATA compliance (fixture selection, ATC identity, inline locators, aliases)
[ ] EP-merge only within a partition, never across partitions/boundaries/states
Review:
[ ] Review checklist passes: §3.4.1 input-domain (EP+BVA) + §3.4.2 state/temporal
    covered or explicit N/A; coverage exceeds the AC floor
[ ] tests green, types clean, lint clean; @atc IDs resolve to real TMS tickets
```

### regression-testing — Run / Classify / Decide

```
[ ] Suite run completed; results + Allure artifacts collected
[ ] Every failure classified (REGRESSION / FLAKY / KNOWN / ENVIRONMENT / NEW TEST)
[ ] Pass-rate + trend computed; no silent truncation of skipped/dropped tests
[ ] GO / CAUTION / NO-GO verdict stated with the evidence behind it
```

---

These checklists are the **minimum** exit bar per stage; a skill may add stage-
specific items in its own reference. Keep them observable, keep N/A explicit, and
verify them in the main thread before advancing — that is what turns the prose
doctrine into an enforced gate.
