# Stage Gates — Definition-of-Done and agentic contract per workflow stage

> Shared doctrine cited by every workflow skill's `## Subagent Dispatch Strategy`.
> Companion to `briefing-template.md` (the 7-component dispatch),
> `session-management.md` (the per-stage progress checkpoint) and
> `artifact-lifecycle.md` (which status every artifact must be in). Where the briefing
> says *what to send a subagent* and session-management says *how to record that
> it ran*, this file says **what must be TRUE before the orchestrator advances to
> the next stage or hands off** — and **who was allowed to decide what** while the
> stage ran.

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

## The stages, by name

The pipeline is **eight named stages**. Stages are named by word, never by number.
The number collided in two directions at once: the old "Stage 4" hosted IQL steps
4 *and* 5, and "Stage 1" already meant something else inside the legacy TMLC prose
under `docs/methodology/`. The table below is the **only** place the historical
numbering appears; anything that still cites `stage-gates.md §Stage N` resolves
through it.

| Stage | Owning skill | Moment | Capability | Historical number |
|---|---|---|---|---|
| **Shift-Left** | `shift-left-testing` | pre-sprint (batch) | L1 — Prevention | (Stage 0) |
| **Planning** | `sprint-testing` | in-sprint | L1 — Prevention | (Stage 1) |
| **Execution** | `sprint-testing` | in-sprint | L2 — Early Detection | (Stage 2) |
| **Reporting** | `sprint-testing` | in-sprint | L2 — Early Detection | (Stage 3) |
| **Documentation** | `test-documentation` | post-sprint | L3 — Continuous Detection | (Stage 4) |
| **Automation** | `test-automation` | post-sprint | L3 — Continuous Detection | (Stage 5) |
| **Regression** | `regression-testing` | post-sprint | L3 — Continuous Detection | (Stage 6) |
| **Observation** | *none yet* | production | L4 — Production Observation | (never had one) |

**Observation is declared, not implemented.** It has **no skill**; its operating
unit is an **agentic routine** (a recurring or autonomous run, not a user-invoked
skill), and its capability level is **L4**. It is named here so the pipeline is
honest about where it currently stops: nothing under `.agents/skills/` executes it
today. It deliberately carries **no DoD checklist** below — an empty checklist
would read as an implemented gate that an orchestrator could tick.

**Sprint close is not a stage.** It is the batch boundary where the sprint-altitude
artifacts (STP / STR) are closed out, and it is reached from Reporting or from
Regression, whichever arrives there first. It keeps its own DoD block below.

---

## The agentic contract per stage

A DoD says what must be TRUE. The contract says **who did it, who signed it, what
evidence survives, how much rope the agent had, and whether a second agent checked
the first one.** Both are gates. An orchestrator that advances a stage whose
contract was not honoured has skipped a gate exactly as much as one that ticked a
DoD item it never verified.

### Autonomy scale (CSA 0-5)

| Level | Means |
|---|---|
| 0 | none — the human performs the work |
| 1 | assisted — approval per action |
| 2 | supervised — approval per plan or per batch |
| 3 | conditional — decides inside stated limits, escalates outside them |
| 4 | high — supervision by monitoring, not by approval |
| 5 | full — no routine human involvement |

**No stage in this pipeline runs above 3.** That ceiling is the architectural
decision behind "skills do not run end-to-end autonomously", not an accident of
how much has been built.

### Contract table

| Stage | The agent does | The person signs | Evidence that must survive | Autonomy | Separate verifier |
|---|---|---|---|---|---|
| **Shift-Left** | Rewrites ACs as Given/When/Then with concrete data, surfaces gaps and ambiguities, authors the pre-sprint ATP into the Story field, applies the Test-Design Checklist | The batch of candidate Stories and the per-Story summary; never lets the Story pass `Estimation` | Rewritten ACs, gaps as open questions to PO/Dev, dated label, review subtask | **2** | **none** — the PO/Dev refining the Story is the natural reviewer |
| **Planning** | Creates ATS → ATP → ATR set-first, derives TCs or outlines per modality, decides the UI/API/DB surfaces by triage + veto + risk score | The Story Explanation checkpoint (the skill explains the story and waits) | ATP as a Test Plan item, ATR carrying its Test Environment (hard gate), coverage stated on both axes | **2** | **none** |
| **Execution** | Runs smoke as Go/No-Go, executes the outlines, explores past them across the trifuerza, proposes bugs with derived severity | The triage of every bug and the **filing** of every bug; any security/auth severity recalibration | Screenshots under the PBI `evidence/` folder, smoke demonstrably run first | **3** | **none** |
| **Reporting** | Fills the ATR, writes the QA comment, creates and verifies the traceability links | The workflow transition (`qa_sign_off` / `defect_reported`) | ATR as a Test Execution item, links resolved and verified in direction | **2** | **none** |
| **Sprint close** | Creates or completes the sprint STR (first-to-arrive creates it, the other completes it), sets its Test Environment, links STR → STP via the `testPlan` edge | The STP's closure — its final scope/progress and the transition to its terminal state | STR as a Test Execution item carrying its Test Environment, STR → STP link resolved, STP at its terminal state | **2** | **none** |
| **Documentation** | Derives scenarios by technique, scores ROI, proposes Candidate / Manual / Deferred, persists only the regression-worthy ones | **Every ROI verdict**, the regression epic, the Test Set | ROI score per scenario; the >50% Candidate/Manual alarm answered | **2** | **recommended** — a second agent re-reads the verdicts against the ATR |
| **Automation** | Writes `spec.md` + `automation-plan.md`, then KATA code with `@atc`, then runs the three verifiers and opens the PR | The plan **before a line of code**; the merge; the call at the third revision loop | Tests green, types clean, lint clean, `@atc` ids resolving to real tickets, manifest fresh | **2 → 3** inside the approved plan | **required** — `/pr-review-lead` or `/judgment-day`, in a clean context |
| **Regression** | Runs the suite, classifies every failure, computes pass-rate and trend, emits GO / CAUTION / NO-GO, writes the STR | The CAUTION verdict; never invents the sprint number | Allure report; ≥5 runs of history before the word FLAKY is allowed (below that: INSUFFICIENT HISTORY); rate computed over the last N = min(10, available); STR → STP | **3** (4 for a clean GO) | **none** |
| **Observation** | *(agentic routine, no skill)* Watches SLOs, error budget, RUM and canary signals; opens items into the backlog; feeds the next Shift-Left pass | The SLOs and the error-budget policy; the decision to stop releases | Product metrics against the project's own targets | **3** | **n/a** |

Read the table with the DoD checklist of the same stage, not instead of it: the
DoD is the exit bar, the contract is the operating licence.

### Feedforward and feedback

Every stage is governed on two paths. A stage with only one of them is not
governed — it is either unguided or uncorrected.

| Path | Direction | What it is, concretely |
|---|---|---|
| **Feedforward** | conditions the work *before* it happens | the skill itself (`SKILL.md` + its `references/`), the compact rules resolved from `.agents/skills/REGISTRY.md` into the briefing, and the spec written and approved first — the ATP, `spec.md`, `automation-plan.md` |
| **Feedback** | corrects the work *after* it happens | the DoD checklists below; the executable gates (`bun run test`, `types:check`, `lint:check`, `skills:check`, `kata:manifest:check`); the regression suite and its failure classification; the separate verifier where the contract demands one |

Feedforward is cheap and pre-emptive, feedback is expensive and late, and the two
trade off against each other. That is why **Automation** — the only stage whose
autonomy reaches 3 — is also the only stage with a mandatory separate verifier:
more rope on the way in is paid for with a harder check on the way out.

---

## Lifecycle expectations per stage

A DoD item can be ticked while the artifact it produced sits frozen in the status
Jira's `Create` transition dropped it in. That is the failure this section closes.
**Every stage below owns the STATUS of the artifacts it created or finished**, not
just their existence — and the canonical per-artifact table (born here, moved there,
terminal there) is `artifact-lifecycle.md` §1. Do not restate it; resolve against it.

| Stage | Artifacts whose status this stage owns | Where they must be when the stage closes |
|---|---|---|
| **Shift-Left** | Story · `[QA] Shift-Left Review` subtask | Story at `estimation` (via `analyze` → `estimate`, stopping there); subtask at `close` (via `complete`) |
| **Planning** | ATP · ATS · ATR · sprint TCs (xray) · STP | ATP at `ready` (via `designed`); ATS still `designing` (membership is not final until Reporting); ATR `active` **carrying its Test Environment**; TCs at `ready` (via `start_design` → `ready_to_run`), parented to **QA Test Repository**; STP at `ready` once the sprint scope is set |
| **Execution** | Story / coverable | at `in_test` (via `start_testing`), `qa_assignee` set to self |
| **Reporting** | ATR · ATS · ATP · Story · filed Bug/Defect/Improvement | ATR at `close` (via `complete`, after every run status is recorded); ATS at `close` (via `done`); ATP at `completed` (via `complete`); Story at `qa_approved` or `blocked`; each filed issue at `open`, parented to **QA Defect Management** |
| **Sprint close** | STP · STR | STP at `completed` (via `complete`); STR at `close` (via `complete`) after the verdict is written |
| **Documentation** | promoted TCs · RTP · feature TS · Preconditions | Candidate TCs at `candidate` (via `automation_review_from_ready` → `approve_to_automate`); Manual TCs at `manual` (via `for_manual`, **from `ready` — there is no `in_review` → `manual` edge**); Deferred TCs stay `ready`; RTP at `ready` and **stays there** (long-lived, never `completed`); feature TS stays `designing`; Preconditions stay `active` (no transition exists) |
| **Automation** | TCs in scope | `in_automation` at Code start (via `start_automation`); `pull_request` when the ticket PR opens (via `create_pr`); `automated` ONLY after the suite PR merges to `main` with CI green (via `merged`) |
| **Regression** | STR · RTP | STR at `close` (via `complete`) after the verdict; RTP **untouched at `ready`** — a regression run never completes the plan it ran from |
| **Observation** | *(no skill, no artifacts)* | n/a |

**Ownership and parenting are part of the same gate.** Every artifact CREATED by a
stage carries `assignee` = the acting QA user at create time (`artifact-lifecycle.md`
§2 — an unassigned Xray Test Plan cannot have Tests added to it later, which surfaces
as a blocker long after the Plan exists), and is parented to its QA process epic
(§3). Before editing an artifact someone else owns, ask.

**When the slug does not resolve**, run the unmapped-status fallback protocol
(`artifact-lifecycle.md` §4): list the LIVE transitions, propose the closest synonym in
ONE `AskUserQuestion`, fire the live id on yes, and recommend `bun run jira:sync-workflows`
so the catalog learns it. Never skip silently, never guess an id.

## The light stage verifier — every stage's closing step

**Each stage below closes by running the light stage verifier** from
`artifact-lifecycle.md` §5 — the eight-line checklist covering artifact keys, links,
statuses, assignee, parent + components, Jira body written, `progress.md` checkpoint,
and the chat session footer. It is *light*: the agent answers from what it already did
this stage, plus at most ONE extra read (a single `Get Issue` on the stage's primary
key) to confirm status. It is not a re-audit.

The verifier composes with the DoD, it does not replace it: the DoD says the work
happened, the verifier says nothing was silently left behind. Every line is `YES` or a
**stated** `N/A` with its reason; a blank line is a failed verifier, and any `NO` makes
the stage NEEDS REVISION.

---

## Per-stage DoD checklists

### Shift-Left — `shift-left-testing`, per-Story refinement

```
[ ] Refined ACs written as Given/When/Then with specific data
[ ] Gaps / ambiguities / edge-cases-not-in-story surfaced as PO/Dev questions
[ ] Test-Design Checklist applied: each non-trivial AC exploded to outlines by
    technique (EP/BVA/State-Transition/Decision-Table/Pairwise) or a stated
    `trivially atomic` justification
[ ] Coverage estimate reflects the real 1:N (not a minimized count)
[ ] Inferred scenarios marked NEEDS PO/DEV CONFIRMATION
[ ] NO TMS test entities created (outlines only); label + transition applied
[ ] Artifact statuses match §"Lifecycle expectations per stage"; light stage verifier run
```

### Planning — `sprint-testing`

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
[ ] Artifact statuses match §"Lifecycle expectations per stage"; light stage verifier run
```

### Execution — `sprint-testing`

```
[ ] Smoke pass run first (Go/No-Go) before deep exploration
[ ] Planned outlines executed AND exploration probed beyond them
[ ] Newly-discovered partition/boundary/transition folded back into the outline set
[ ] Evidence captured under the PBI folder; outline/Test status updated
[ ] Bugs filed with story + AC traceability where found
[ ] Artifact statuses match §"Lifecycle expectations per stage"; light stage verifier run
```

### Reporting — `sprint-testing`

```
[ ] ATR authored as a **Test Execution** item (`ATR: {STORY-KEY}: Story Testing`); Story custom field only as fallback
[ ] QA comment posted; ticket transitioned to the correct status
[ ] Regression follow-up noted for any regression-worthy bug (Stage-4 hand-off); bug retest (xray):
    repro Test's run recorded PASSED/FAILED in the retest Execution
[ ] Traceability verified — xray: Story↔ATS (`test` slug, coverage) + ATS membership complete +
    Story↔ATP / Story↔ATR (administrative); native: field/comment containers populated
[ ] Artifact statuses match §"Lifecycle expectations per stage"; light stage verifier run
```

### Sprint close — `sprint-testing` (batch close, or `/regression-testing` if it arrives first)

```
[ ] The sprint **STR** (`STR: Sprint#{N}: Regression Testing`, Test Execution item, parent
    QA Test Artifacts) exists — first-to-arrive creates it, the other completes it
[ ] The STR carries its **Test Environment** (same hard gate as the ATR): no environment → DoD failure
[ ] The STR links to the sprint STP via the `testPlan` edge (`STR → STP`); the STP is closed out
    with its final scope/progress and transitioned to its terminal state
[ ] Skip-with-a-stated-note ONLY when the `Test Plan` / `Test Execution` work types are absent
    (no field fallback at sprint altitude) — never a silent skip
[ ] Artifact statuses match §"Lifecycle expectations per stage"; light stage verifier run
```

### Documentation — `test-documentation`, Analyze / Prioritize / Document

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
[ ] Artifact statuses match §"Lifecycle expectations per stage"; light stage verifier run
```

### Automation — `test-automation`, Plan / Code / Review

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
[ ] Separate verifier run in a clean context (`/pr-review-lead` or `/judgment-day`)
    — REQUIRED, not opt-in; skipping it is a DoD failure, not a high-risk-only step
[ ] Artifact statuses match §"Lifecycle expectations per stage"; light stage verifier run
```

### Regression — `regression-testing`, Run / Classify / Decide

```
[ ] Suite run completed; results + Allure artifacts collected
[ ] Every failure classified (REGRESSION / FLAKY / KNOWN / ENVIRONMENT / NEW TEST)
[ ] Pass-rate + trend computed; no silent truncation of skipped/dropped tests
[ ] GO / CAUTION / NO-GO verdict stated with the evidence behind it
[ ] Artifact statuses match §"Lifecycle expectations per stage"; light stage verifier run
```

---

### Observation — no checklist

Intentionally empty. Observation has no owning skill and no DoD; its operating
unit is an agentic routine that does not exist in this repo yet. Writing a
checklist here would hand an orchestrator a gate it cannot actually verify.

---

These checklists are the **minimum** exit bar per stage; a skill may add stage-
specific items in its own reference. Keep them observable, keep N/A explicit, and
verify them in the main thread before advancing — that is what turns the prose
doctrine into an enforced gate. The contract table above is verified the same way:
name the stage's autonomy level and its verifier in the briefing, and check on
return that the human signatures it lists were actually collected.
