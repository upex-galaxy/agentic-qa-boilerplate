# Artifact Lifecycle — which status every harness artifact lives in, who moves it, and what to do when the slug is missing

> Shared doctrine cited by every workflow skill. Companion to `stage-gates.md` (what must
> be TRUE to advance a stage), `traceability-linking.md` (which edges must exist) and
> `defect-management-doctrine.md` (how a quality issue is classified, parented and owned).
> Where stage-gates says *the stage is done*, this file says **the artifacts the stage
> touched are in the status they are supposed to be in, and they are owned by someone.**
>
> **Load this before firing any transition.** The slugs below are the only valid
> `{{jira.status.<type>.<slug>}}` / `{{jira.transition.<type>.<slug>}}` references; they
> resolve against `.agents/jira-required.yaml` (`work_types.*.required_statuses` /
> `required_transitions`) and `.agents/jira-workflows.json` (the workspace-resolved ids).

## Why this file exists

An artifact that is created and never moved is indistinguishable from an artifact nobody
worked on. A Test Plan frozen in `Planning` after its whole Story shipped tells the team
the plan was never designed; a Test Set frozen in `Designing` says the coverage set is
still being assembled; a Test Execution frozen in `ACTIVE` says the run is still going.
All three were the observed behavior before this file existed, in every project running
the harness — the skills created the artifacts, wrote their bodies, linked them, and left
them where Jira's `Create` transition dropped them.

The root cause was not prose: it was that the harness had **no declared lifecycle** for
the TMS work types at all. `.agents/jira-required.yaml` declared statuses and transitions
for `story`, `bug`, `test_case`, `epic`, `defect`, `improvement`, `tech_story` and
`tech_debt`, and for nothing else — so no skill could reference a Test Plan / Test
Execution / Test Set / subtask transition even if its author had wanted to.

---

## 1. The lifecycle table

Read a row as: **this artifact is born HERE, this stage moves it THERE, and it ends HERE.**
"Created in status" is always whatever the work type's `create` transition lands on — Jira
decides that, not the skill. Everything after that is the harness's job.

| Artifact | Work type | Created by | Created in | Moved by → target (transition slug) | Terminal |
|---|---|---|---|---|---|
| **Story** | `story` | PO (external) | `backlog` | `/shift-left-testing` handoff: `analyze` → `shift_left_qa`, then `estimate` → `estimation` · `/sprint-testing` Execution: `start_testing` → `in_test` · Reporting PASSED: `qa_sign_off` → `qa_approved` · Reporting FAILED (formal gate): `defect_reported` → `blocked` | `deployed_to_production` (released by the team, never by the harness) |
| **Bug / Defect / Improvement** | `bug` / `defect` / `improvement` | `/sprint-testing` Reporting (filed) | `open` | dev owns `start_fixing` → `in_progress` … `fixed_and_deployed` → `ready_for_qa` · `/sprint-testing` retest PASSED: `retest_passed` → `closed` · regression after close: `back` → `ready_for_qa`, or `re_open` → `open` | `closed` |
| **Product Epic** | `epic` | PO (external) | `backlog` | **the harness never moves a product epic.** `plan` / `ready_to_work` / `complete` belong to the PO | `done` |
| **QA process epics** (QA Defect Management · QA Test Repository · QA Master Test Plan · QA Test Artifacts) | `epic` | project setup (`qa.qa_epics.*`) | `backlog` | **never moved** — permanent buckets, not work. Do not "complete" one | n/a (stays wherever setup left it) |
| **Test (TC)** | `test_case` | `/sprint-testing` Planning (jira-xray) · `/test-documentation` Document (jira-native) | `draft` | authoring: `start_design` → `in_design`, `ready_to_run` → `ready` · `/test-documentation` **Candidate** verdict: `automation_review_from_ready` → `in_review`, `approve_to_automate` → `candidate` · **Manual** verdict: `for_manual` → `manual` (from `ready`, see §1.1) · **Deferred**: stays `ready` · `/test-automation`: `start_automation` → `in_automation`, `create_pr` → `pull_request`, `merged` → `automated` | `automated` · `manual` · `deprecated` |
| **ATP** (Acceptance Test Plan) | `test_plan` | `/sprint-testing` Planning (find-or-create from the Story's `{{jira.acceptance_test_plan}}` field) | `planning` | Planning end: `designed` → `ready` · Reporting end (ATR filed): `complete` → `completed` | `completed` |
| **STP** (Sprint Test Plan) | `test_plan` | `/sprint-testing` Session Start, first ticket of the sprint | `planning` | once the sprint scope is set: `designed` → `ready` · sprint close: `complete` → `completed` | `completed` |
| **FTP** (Feature Test Plan) | `test_plan` | `/sprint-testing` feature-test-planning | `planning` | scope agreed: `designed` → `ready` · stays `ready` for the life of the feature · epic closes: `complete` → `completed` | `completed` |
| **RTP** (Regression Test Plan) | `test_plan` | `/test-documentation` (promotion target) | `planning` | first promotion: `designed` → `ready`, then **stays `ready`** — it is long-lived, never completed while the product ships | `ready` (long-lived) |
| **MTP** (Master Test Plan) | `epic` | `/project-context` mode `test-plan` | — | the MTP is the **QA Master Test Plan Epic**, not a Test Plan item (defect-management-doctrine Part 4). Never moved | n/a |
| **ATR** (Acceptance Test Results) | `test_execution` | `/sprint-testing` Planning (created with its Test Environment) | `active` | Reporting, after every run status is recorded: `complete` → `close` | `close` |
| **STR** (Sprint Test Results) | `test_execution` | sprint close — `/sprint-testing` batch close or `/regression-testing`, whoever arrives first | `active` | after the GO / CAUTION / NO-GO verdict is written: `complete` → `close` | `close` |
| **RTR** (Regression Test Results) | `test_execution` | `/regression-testing` Phase 1, before the CI trigger (created with its Test Environment, assignee self, `testPlan → RTP`) | `active` | after the GO / CAUTION / NO-GO verdict comment is posted on it: `complete` → `close`. One RTR per verdict: an environment re-run before the verdict imports into the same RTR; a re-run after a verdict is a new RTR, never `reactive` | `close` |
| **Re-Test Execution** | `re_test_execution` | `/sprint-testing` bug retest | `active` | after the repro Test's run is recorded PASSED/FAILED: `complete` → `close` | `close` |
| **ATS** (Acceptance Test Set) | `test_set` | `/sprint-testing` Planning (Set-first order, step ①) | `designing` | Reporting, once membership is final: `done` → `close` | `close` |
| **TS** (feature Test Set, optional) | `test_set` | `/test-documentation` (lazily, 1:1 with the Epic) | `designing` | **stays `designing`** — a feature set keeps accepting members for the life of the feature. `done` → `close` only when the Epic itself closes | `close` (at Epic close) |
| **Precondition** | `precondition` | `/test-documentation` | `active` | **no transition exists in the catalog** — the workflow has `create` and nothing else. It stays `active`; that is correct, not a gap | `active` |
| **Tech Story / Tech Debt** | `tech_story` / `tech_debt` | dev (external) | `to_do` | dev owns `start_working` / `ready` · `/sprint-testing` Reporting on a coverable tech item: `test_finished` → `automated` (the QA-verified terminal) or `complete` → `completed` when the item carried no test scope | `completed` / `automated` |
| **`[QA] Shift-Left Review` subtask** | `subtask` | `/shift-left-testing` Phase 1 | `active` | handoff, after the exhaustive session annotations are posted on it: `complete` → `close` | `close` |

**A row in this table is where the artifact must END UP, not a promise that the move is free.**
A mapped, available transition can still be refused by the instance's own field validators —
measured on the ATS `done` → `close` row, refused by five mandatory fields at once. That is
**§4.2**, not a reason to leave the artifact behind.

### 1.1 Three edges that do not exist — do not look for them

The catalog is the authority, and it says **no** to these. Route around them, never invent an id:

- **`in_review` → `manual` (TC).** There is none. A **Manual** ROI verdict takes `for_manual`
  straight from `ready`; it must NOT be routed through `in_review` first. From `in_review` the
  only exits are `approve_to_automate` → `candidate` and `back_from_in_review` → `ready`.
  A TC already sitting in `candidate` demotes via `manual_execution_from_candidate` → `manual`.
- **Any transition out of `precondition.active`.** The Precondition workflow has one
  transition (`create`). A Precondition lives and dies `active`.
- **A `story` transition from `qa_approved` straight to `deployed_to_production`.** It goes
  `include_in_release` → `ready_for_release` → `released`, and the release team owns both.
  QA stops at `qa_approved`.

Catalog-available but deliberately unused by any stage: `test_execution.reactive` and
`test_set.error` (both re-open a closed container), `test_plan.planned` /
`test_plan.ready_to_execute` (the `plan_automated` side path). A project that needs one may
use it; no skill fires it on its own.

---

## 2. Ownership rule — set the assignee at CREATE, always

**On CREATE of any QA artifact** — Test Plan (ATP / STP / FTP / RTP), Test Execution
(ATR / STR / RTR / Re-Test), Test Set (ATS / TS), Precondition, Test (TC), and the `[QA]
Shift-Left Review` subtask — **the harness sets `assignee` to the acting QA user (the
authenticated session identity, i.e. self).**

This is not bookkeeping. **Xray refuses membership edits on a Test Plan the calling user
does not own**: a Plan created unassigned cannot have Tests added to it later, and the
skill reports that as a blocker mid-flow, after the Plan already exists. A Plan created
without an assignee is a blocker waiting to happen.

Alongside it, on **work items** (story / tech_story / tech_debt / bug / defect /
improvement) the harness sets `{{jira.qa_assignee}}` to self per
`defect-management-doctrine.md` Part 2 — **read-before-write, never overwrite an existing
owner.** `qa_assignee` is the QA owner and is DISTINCT from the native dev `assignee`.

**Before EDITING an artifact that already exists**: read its `assignee` first. If it is
someone else, **ask the user before reassigning** — do not take ownership silently to make
an edit go through. If the user declines, report the edit as blocked with the owner named.

**A transition can reassign the issue behind your back.** Some workflows carry an *assign*
post-function that is invisible in the transition catalog. Measured 2026-09-17: on a work item,
both `start_testing` and `qa_sign_off` silently moved the native `assignee` from the developer
to the QA engineer who fired them, on a project whose doctrine deliberately keeps the two
owners distinct. So on any transition of a work item: read `assignee` before firing (the same
GET that lists the available transitions gives it), read it back after, and if the transition
moved it, **restore the previous owner** and record the post-function in the stage's Transition
Trail. QA ownership belongs in `{{jira.qa_assignee}}`; the native `assignee` belongs to whoever
the project says owns delivery. Canon: `defect-management-doctrine.md` Part 2.

## 3. Parenting rule — one line, cited

Every `Test` → **QA Test Repository** · every Test Plan (ATP / STP / FTP / RTP) → **QA
Master Test Plan** · every Test Execution, Test Set and Precondition → **QA Test
Artifacts** · every bug / defect / improvement → **QA Defect Management**. Never a
product or dev epic. Three axes, never collapsed: **parent** = QA bucket · **link** =
source coverable · **components** = product module. Canon: `AGENTS.md` §9 +
`defect-management-doctrine.md` Part 4.

---

## 4. Unmapped-status fallback protocol — never strand an artifact

A project that renamed its statuses, uses a synonym, or is running against a stale catalog
must not end up with silently un-transitioned artifacts. When a transition is needed:

1. **Resolve** `{{jira.transition.<type>.<slug>}}` from `.agents/jira-workflows.json` (via
   `.agents/jira-required.yaml`). Present → fire it by **id** and move on.
2. **Slug ABSENT for that work type** → do NOT skip silently, and do NOT guess an id.
   Run `[ISSUE_TRACKER_TOOL] Get Transitions: {KEY}` to list the LIVE transitions available
   from the issue's current status (syntax + the id-vs-name gotcha:
   `.agents/skills/acli/references/gotchas.md` §9 — `acli --status` matches by target status
   name and has no `--transition-id` flag, so an ambiguous target needs the REST escape hatch).
3. **Pick the closest candidate by name**, using the synonym table in §4.1, and present
   **ONE** `AskUserQuestion`:

   > `{KEY}` needs to move to **`<intended status>`**, but this project has no mapped
   > transition `<slug>` for work type `<type>`. Live transitions from `<current status>`:
   > **A** `<name>` → `<target>` · **B** `<name>` → `<target>` · **C** `<name>` → `<target>`.
   > Transition via **`<best guess>`**?
   > — *yes* / *pick another* / *skip (leave it in `<current status>`)*

4. **On yes**: execute with the **live id** (never a name, never a remembered id), record the
   executed transition in the session `progress.md` checkpoint (and in the stage's Transition
   Trail where the skill keeps one), and **RECOMMEND** to the user:
   `bun run jira:sync-workflows` then `bun run jira:check` — so the catalog learns the
   mapping and the next session resolves it at step 1. **Never hand-edit
   `.agents/jira-workflows.json`**: it is generated.
5. **On skip**: the artifact stays where it is, and the stage's light verifier (§5) records
   that line as an explicit, stated N/A with the reason. A skip the user chose is fine. A
   skip nobody saw is the bug this file exists to kill.
6. **Slug present but Jira REJECTS the transition** (permission, workflow condition, a
   validator demanding a field): report the **exact** error text, do NOT retry blindly, and
   run **§4.2**. This is a different failure from steps 2-5 — the catalog is right and the
   instance is gating the move.

### 4.1 Synonym table — for step 3's best guess

| Intended slug | Common project names to match against |
|---|---|
| `in_test` | Testing · In QA · QA In Progress · Under Test |
| `ready_for_qa` | QA Ready · To Test · Ready to Test · Awaiting QA |
| `qa_approved` | QA Passed · Verified · Approved · QA Sign-Off · Tested |
| `closed` | Done · Resolved · Complete · Verified |
| `blocked` | BLOCKED · On Hold · Impediment |
| `ready` (test_plan) | READY · Approved · Ready to Execute · Designed |
| `completed` (test_plan) | Completed · Done · Closed · Archived |
| `close` (test_execution / test_set / subtask) | Close · Closed · Done · Finished |
| `designing` (test_set) | Designing · Draft · In Design · Building |
| `candidate` (test_case) | Candidate · Automation Candidate · Approved for Automation |
| `automated` (test_case) | AUTOMATED · Automated · Done |

A match is a **suggestion to the user**, never an automatic choice. Present it, wait.

### 4.2 Mapped slug, gated by validators — the transition exists and Jira still says no

§4 steps 2-5 cover a slug the catalog does **not** have. This covers the commoner case: the
slug resolves, the transition is listed as available, and firing it returns a validation
error. Measured 2026-09-17: closing a Test Set was refused by **five** mandatory-field
validators at once (Test Analysis, VCR Estimation, Test Outline, automation type, regression
flag) — none of them in the transition catalog, all of them added by the project's own screen
configuration. A stage that reads that as "transition unavailable" strands the artifact in
`designing` and still reports itself done.

1. **Read the error in full.** A validator names the fields it wants. A *condition* failure
   (`you do not have permission`, `the issue is not assigned to you`) is a different thing —
   check §2 first: an artifact the acting user does not own is the commonest cause, and taking
   ownership to force an edit through is not automatic (ask).
2. **Fill what the stage legitimately knows**, then re-fire ONCE. A mandatory field the stage
   has real content for (the test outline it just authored, the automation type the ROI verdict
   already decided) is written and the transition retried. This is the normal resolution and
   needs no user interaction.
3. **Never invent a value to satisfy a validator.** An estimation, a risk rating or a
   regression flag the stage does not actually know is fabricated data that outlives the
   session and is later read as QA's judgement.
4. **Whatever is left → ONE `AskUserQuestion`**, naming the artifact, the target status, the
   exact fields the validator demands and which of them the stage cannot answer:
   *fill them together now* / *leave the artifact at `<current status>`* / *another route the
   user names*.
5. **On leave**: the light verifier (§5) takes that line as an explicit stated N/A quoting the
   validator's own words — never a blank, and never the misleading "no transition available".
6. **Record it once per project, not once per artifact.** A validator set this heavy is
   configuration, not an incident: note it in the session `progress.md` checkpoint the first
   time it fires so later stages of the same run expect it, and raise it with the team — five
   mandatory fields on a close transition is friction QA pays every sprint.
   `bun run jira:sync-workflows` will NOT learn it: screen configuration is not part of the
   transition catalog, so there is nothing to re-sync.

---

## 5. Light stage verifier — the closing checklist of every stage

Every workflow stage closes with this. **"Light" means the agent answers each line from
what it already did or read during the stage**, plus **at most ONE extra read call** (a
single `[ISSUE_TRACKER_TOOL] Get Issue` on the stage's primary key, to confirm status). It
is NOT a re-audit: it does not re-walk links it just created, and it does not re-read every
artifact. Its job is to catch the thing that was silently skipped.

```
Light stage verifier — <Stage name>
[ ] Artifacts exist — every artifact this stage owns, by KEY (not "created OK")
[ ] Links present — three-edge check per traceability-linking.md §10
[ ] Statuses — each artifact in its expected status per artifact-lifecycle.md §1
    (name the transition fired, or the stated reason it was not)
[ ] Assignee set on every artifact CREATED this stage (§2)
[ ] Parent = the right QA process epic; components set (§3)
[ ] Jira fields / comments written (the body actually landed, not just the item)
[ ] progress.md checkpoint appended (session-management.md §7)
[ ] Session footer printed in chat (session-footer-contract.md)
```

**Answering rules.** Every line is `YES` or a **stated** `N/A` with its reason — a blank
line is a failed verifier, not a passed one. Any `NO` makes the stage **NEEDS REVISION**
per `stage-gates.md`: fix it or surface it, never advance past it. An unmapped status that
the user chose to skip in §4 is a legitimate stated N/A; an unmapped status nobody asked
about is a `NO`.

A skill lists only its **stage-specific** lines inline (which artifacts, which statuses)
and cites this template for the rest — the eight lines above are not repeated per skill.
