# QA Planning Ladder: Nomenclature Standard (ratified 2026-06-26, amended 2026-08-21, 2026-09-15 and 2026-09-23)

> This is ratified doctrine, not an open proposal. The skills treat it as settled (`agentic-qa-core/references/defect-management-doctrine.md`, `traceability-linking.md`), so do not re-litigate the ladder from this file. The five ratified decisions (A to E) and the amendment history are in §7 (Decision log); `git log --follow` walks the file's own history.
>
> Scope: the test-planning hierarchy (MTP / FTP / STP / ATP / RTP) and its runners (STR / ATR / RTR), the ATS coverage rung, the four QA process Epics that hold them, the Jira-item-over-custom-field rule, and Test Set naming. Test-case naming (`should …`), `@atc`, components, tags and branches are already ratified in the Naming Codex.

---

## 0. Design goals (the justification, up front)

1. **One grammar, every altitude.** Before the standard, the same Jira "Test Plan" work type was titled three ways (`Test Plan: PROJ-123`, `QA: TestPlan: Regression S50`, `<Strategy>: <ID>: <sum>`), so a reader or a JQL query could not tell the altitude from the title. Every Plan and Run now gets a 3-letter acronym prefix, which makes altitude and plan-versus-run legible in the first token and pairs each Plan with its Run.
2. **Items, not fields, by excellence.** A dedicated Jira issue gives real issue-links, an independent status lifecycle, run history and no Story-field bloat. Custom fields on the Story are a degraded fallback, used only when the instance lacks the work type.
3. **Everything has exactly one home and cross-links (the 3-axis model, extended).** The repo already parents quality issues to a QA process Epic (not a product Epic), with source carried by an issue-link and product area by components. The standard extends that model from 2 governance Epics to 4, so Plans, Runs, Test Cases, Artifacts and Defects each have one bucket and traceability stays on the link axis.
4. **The embedded testing term maps to the activity.** STR is *Sprint Regression Testing* and ATR is *Story Testing*, so the run's title states which sprint-testing activity produced it.
5. **Xray-agnostic.** Test Plan, Test Execution, Test Set and Precondition are native Jira work types wherever the instance provisions them (`.agents/jira-required.yaml` declares them), whether or not Xray is installed. The standard therefore does not branch on modality for structure. Only Xray's run and coverage engine is optional.

---

## 1. The four QA-process Epics (extends the existing 3-axis model)

The repo defines four QA-process Epics in `.agents/project.yaml` under `qa.qa_epics`, so every QA artifact type has a dedicated governance Epic.

| QA-process Epic | `qa.qa_epics.<key>` | Holds (child work types) |
|---|---|---|
| **QA Master Test Plan** (the MTP) | `master_test_plan_epic` | every **Test Plan** (FTP · STP · ATP · RTP) |
| **QA Test Repository** | `test_repository_epic` | every **Test** (Test Case) |
| **QA Test Artifacts** | `test_artifacts_epic` | every **Test Execution** (STR · ATR · RTR), **Precondition**, **Test Set** (ATS · TS) |
| **QA Defect Management** | `defect_epic` | every **Bug / Defect / Improvement** |

The `QA ` prefix is deliberate (an existing convention): a reader scanning the Epic list sees `QA …` and knows it is a process Epic, not a product feature. The MTP Epic therefore reads `QA Master Test Plan` for family consistency, and the "Master Test Plan + QA Engineering hub" intent lives in the Epic description (§1.1). All four are excluded from the Components module (process buckets, never a selectable product component).

### 1.1 The MTP Epic: special role

`QA Master Test Plan` is an Epic, and its description is the Master Test Plan. Jira is the source of truth, and the sync caches the plan at `.context/PBI/qa-artifacts/master-test-plan.md` (gitignored, never hand-edited; `.context/ADR/ADR-0007-mtp-in-jira.md`). The Epic is not a Test Plan work type. It is the umbrella Epic whose children are every Test Plan in the project (FTP/STP/ATP/RTP). Its description holds:

- the master test strategy, under a `## Master Test Plan` section written by `project-context` mode `test-plan` (what to test, why, risk ranking, regression Epic pointer, pass-rate SLOs). It is budgeted to the product altitude: Jira caps a description's serialized ADF, so feature depth goes down one rung, into each feature's FTP;
- a pointer to the official QA team repository (this boilerplate clone, the home of Agentic Testing and Test Automation for the project).

It is cross-linked (`relates to`) to its three sibling QA Epics (QA Test Repository, QA Test Artifacts, QA Defect Management), so the four form a navigable QA-governance cluster.

The MTP is not the RTP. The MTP is the Epic and its description: the strategy, and the bucket every Plan hangs from, never a Test Plan item. The RTP is one of the items inside that bucket, an executable Test Plan whose membership is the regression suite that actually runs. Strategy and suite stay separate.

### 1.2 The three axes per artifact (unchanged model, extended buckets)

```
parent / Epic Link  ->  QA-PROCESS EPIC   (which QA bucket tracks this)
issue link          ->  SCOPE under test  (Story / feature-Epic / Sprint — traceability)
components          ->  PRODUCT module     (what part of the product it touches)
```

| Artifact | Work type | Parent Epic (axis 1) | Issue-link / scope (axis 2) |
|---|---|---|---|
| MTP | **Epic** | none (top of the QA cluster) | `relates to` the 3 sibling QA Epics |
| FTP | Test Plan | QA Master Test Plan | `tests` the product **feature Epic** |
| STP | Test Plan | QA Master Test Plan | `relates to` the **Sprint** (+ regression scope) |
| ATP | Test Plan | QA Master Test Plan | `tests` the **User Story** |
| RTP | Test Plan | QA Master Test Plan | `relates to` the Regression Epic (if any); membership = `regression-candidate` Tests |
| STR | Test Execution | QA Test Artifacts | `relates to` Sprint · `testPlan` → STP and → RTP (dual membership) |
| ATR | Test Execution | QA Test Artifacts | `is tested by` Story · `testPlan` → ATP |
| RTR | Test Execution | QA Test Artifacts | `testPlan` → RTP · optional `relates to` a Release issue (release-candidate runs) |
| ATS | Test Set | QA Test Artifacts | `tests` the **User Story**: **this link is what fills the coverage panel** |
| TS (feature-level) | Test Set | QA Test Artifacts | groups Tests by feature/module (optional) |
| Precondition | Precondition | QA Test Artifacts | `relates to` the Tests it sets up |
| Test (TC) | Test | QA Test Repository | ATP `designs` · ATR `executes` |
| Bug/Defect/Improvement | Bug/… | QA Defect Management | `is caused by` / `blocks` source Story |

Optional roll-up links for coverage aggregation: ATP `is part of` FTP `is part of` STP. Parent stays the MTP Epic for all Plans regardless of roll-up.

> **Coverage evidence (live-verified; see ADR-0006)**: the **ATS→Story** `Test` link (inward `is tested by`) is what fills the Xray coverage panel. A Story linked only to a Test Plan and a Test Execution, both populated, still shows **UNCOVERED, 0 tests**. The ATP→Story and ATR→Story links are administrative traceability only. Direct TC→Story links also provide coverage, but only as the last-resort step of the resolution cascade (`TC → ATS → Story`, then `TC → ATP → Story`, then `TC → Story`, then orphan).

---

## 2. The ladder: Plan + Runner per altitude

| Altitude | Plan | Runner | Jira work type | When / who | Cardinality |
|---|---|---|---|---|---|
| **Product** | **MTP** Master Test Plan | none | **Epic** (description = the plan; local cache) | `project-context` mode `test-plan` writes the `## Master Test Plan` section of the `QA Master Test Plan` Epic description and cross-links the 3 sibling QA Epics; the sync caches it at `.context/PBI/qa-artifacts/master-test-plan.md` | 1 per project |
| **Feature / Epic** | **FTP** Feature Test Plan | none (FTR cut: it duplicated the STR) | Test Plan | find-or-create/update when `/sprint-testing` loads the Story's Epic context (`feature-test-planning`); consumed as context from then on. Item-first; Epic field `feature_test_plan` = fallback | 1 per feature |
| **Sprint** | **STP** Sprint Test Plan | **STR** Sprint Test Results | Test Plan → Test Execution | **STP** created at sprint START: find-or-create in the Session Start of the FIRST sprint ticket in `/sprint-testing` (fallback: `/regression-testing` creates it when running suites). It is a LIVING planner, updated per tested ticket and closed at sprint end. **STR** created at sprint CLOSE as the recap of all results (`/sprint-testing` batch-close or `/regression-testing`: the first to arrive creates it, the other completes it) | 1 per sprint (term: "Regression Testing"; "Sprint" comes from the `Sprint#{N}` scope-id) |
| **User Story** | **ATP** Acceptance Test Plan | **ATR** Acceptance Test Results | Test Plan → Test Execution | pre-sprint the ATP lives ONLY in `{{jira.acceptance_test_plan}}` (authored by `/shift-left-testing`); the Test Plan ITEM is born in sprint-testing S1 from that field. ATR item created in S1, filled in S3 | ATP 1 per Story · ATR 1 run ("Story Testing") |
| **User Story (coverage)** | **ATS** Acceptance Test Set | none (membership, not a run) | Test Set | sprint-testing S1, **Set-first**: create/update the ATS with the TCs BEFORE the ATP/ATR items, because Plan and Exec derive their test lists from the ATS membership | 1 per Story, **mandatory** (even with a single TC) |
| **Product (regression, long-lived)** | **RTP** Regression Test Plan | **RTR** Regression Test Results (one per regression verdict; the sprint-close STR may also link to the RTP) | Test Plan → Test Execution | `/test-documentation` find-or-creates it and promotes every `regression-candidate` TC into it (Phase 3). Unlike every other Plan it has **no terminal**: it reaches `ready` on the first promotion and stays there for the life of the product, because a regression run never completes the plan it ran from. **RTR** created by `/regression-testing` BEFORE the CI trigger (so CI imports into its key), the verdict comment lands on it, and it is closed after the verdict | 1 per project (or per module) · RTR 1 per verdict |

---

## 3. The unified title grammar

```
{ACRONYM}: {scope-id}: {descriptor}
```

- **ACRONYM**: `MTP` (epic) · `FTP` · `STP` · `ATP` · `RTP` (plans) · `STR` · `ATR` · `RTR` (runs) · `ATS` (per-Story Test Set, completing the ATC/ATP/ATR/ATS family).
- **scope-id**: the key of the thing under test at that altitude (feature-Epic key, `Sprint N`, Story key).
- **descriptor**: human-readable, and it embeds the testing term where the user requires it.

| Artifact | Jira type | Title pattern | Example |
|---|---|---|---|
| **MTP** | Epic | `QA Master Test Plan` (singleton) | `QA Master Test Plan` |
| **FTP** | Test Plan | `FTP: {EPIC-KEY}: {feature}` | `FTP: PROJ-42: Checkout & Payments` |
| **STP** | Test Plan | `STP: Sprint#{N}: {objective}` | `STP: Sprint#30: Payments hardening` |
| **STR** | Test Execution | `STR: Sprint#{N}: Regression Testing` | `STR: Sprint#30: Regression Testing` |
| **ATP** | Test Plan | `ATP: {STORY-KEY}: {story title}` | `ATP: PROJ-123: Apply discount at checkout` |
| **ATR** | Test Execution | `ATR: {STORY-KEY}: Story Testing` | `ATR: PROJ-123: Story Testing` |
| **ATS** | Test Set | `ATS: {STORY-KEY}: {story title}` | `ATS: PROJ-123: Apply discount at checkout` |
| **RTP** | Test Plan | `RTP: {PROJECT_KEY\|module}: Regression Test Plan` | `RTP: PROJ: Regression Test Plan` |
| **RTR** | Test Execution | `RTR: {scope-id}: Regression Testing` (scope-id `{env}-{YYYY-MM-DD}`, optional `#2` suffix the same day, or a release tag for a release candidate) | `RTR: staging-2026-09-23: Regression Testing` · `RTR: v2.3.0-rc1: Regression Testing` |

> **No "ATP DRAFT" variant exists.** The pre-sprint pass (`/shift-left-testing`) authors the ATP at outline maturity into the `{{jira.acceptance_test_plan}}` custom field only: no Test Plan item, no title variant. `/sprint-testing` Stage 1 creates the item above from that field, under the same title grammar. The pre-sprint pass is marked by the labels `shift-left-reviewed` + `shift-left-{YYYY-MM-DD}`, not by a DRAFT title.

### 3.1 Supporting artifacts (QA Test Artifacts epic)

| Artifact | Jira type | Title pattern | Example | Notes |
|---|---|---|---|---|
| **ATS** (per-Story) | Test Set | `ATS: {STORY-KEY}: {story title}` | `ATS: PROJ-123: Apply discount at checkout` | **mandatory, 1 per Story** (even with a single TC). Parent: QA Test Artifacts. **Components inherited from the Story (mandatory)**. Its `tests` link to the Story fills the coverage panel; Plan/Exec test lists derive from its membership |
| **TS** (feature-level) | Test Set | `TS: {EPIC-KEY\|module}: Validate {feature/module}` | `TS: PROJ-42: Validate Checkout` | groups TCs by feature/module for smoke / regression / feature grouping; **optional**; components optional (may cross modules) |

> **ATS membership, one rule in both modalities**: `TC ∈ ATS` is always a `TC→ATS` issue link (`test` slug), plus the `ATS→Story` link. In **jira-xray** modality the Xray-internal membership (GraphQL: `addTestsToTestSet` / `getTestSet`) is written in addition, never instead (`traceability-linking.md` §9). An instance without the Test Set work type has no ATS. The fallback is direct `TC→Story` links, which the cascade resolves as its last step.

> **Decision B (ratified, rescoped 2026-08-21)**: the feature-level Test Set keeps `Validate`, giving `TS: {scope}: Validate {feature}`. `Validate` therefore stays the grouping word at both the Jira Test Set layer and code `describe()`, consistent with the Naming Codex "Validate = group" law. The `TS:` prefix adds the work-type and altitude signal on top. The per-Story ATS does not use `Validate`: its descriptor is the story title.

> **Precondition** remains a native Jira/Xray entity (parented under QA Test Artifacts) but carries no ladder acronym: the former `PRC:` prefix is retired.

---

## 4. Items over custom fields (standard behavior change)

By excellence, every Plan and every Run is a real Jira issue: a Test Plan item for FTP/STP/ATP/RTP and a Test Execution item for STR/ATR/RTR, in both modalities (these are native Jira work types wherever the instance provisions them, independent of Xray).

**Fallback (degraded mode only):** ATP/ATR may live as custom fields on the User Story only when the Test Plan / Test Execution work types are unavailable in the instance and cannot be created or linked. As soon as the items exist, they are the single source of truth and the fields go unused.

**Timing nuance (D5, 2026-08-21):** pre-sprint the ATP lives only in the `{{jira.acceptance_test_plan}}` custom field. `/shift-left-testing` does not create the Test Plan item ("don't spend artifacts early"). The item is born in `/sprint-testing` Stage 1 from that field, and from then on the items-first rule above applies unchanged.

**Why:** dedicated items give real issue-links (Plan→scope, Run→Plan, Run→TC), an independent status lifecycle and run history, and they avoid Story-field bloat. They also collapse the `jira-xray` vs `jira-native` structural split: both create items, and Xray only adds the run and coverage engine on top.

---

## 5. What changed (migration map)

| Before the standard | Becomes | Why |
|---|---|---|
| `Test Plan: PROJ-123` (ATP, often a Story field) | `ATP: PROJ-123: {title}` (Test Plan item; field = fallback) | acronym grammar + items-first |
| `Test Results: PROJ-123` (ATR field) | `ATR: PROJ-123: Story Testing` (Test Execution item) | acronym grammar + items-first + activity term |
| `QA: TestPlan: Regression S50` (strategy plan) | `STP: Sprint#30: Payments hardening` | folds the "strategy plan" into the Sprint altitude |
| `Regression: TP-50: Sprint 50 Regression` (exec) | `STR: Sprint#30: Regression Testing` | acronym grammar; "Sprint" comes from the scope-id |
| `Sanity: GX-101: Validate credit card payment` (Test Set) | `TS: GX-101: Validate credit card payment` | feature-level Test Sets group by feature/module, not strategy; `TS:` prefix replaces the strategy word |
| `Suite: {STORY-KEY}` (per-Story Set) | `ATS: {STORY-KEY}: {story title}` | the `Suite:` prefix dies; the per-Story Set becomes the mandatory ATS coverage rung |
| (nothing) FTP/STP/STR | new artifacts at Feature & Sprint altitude | fills the ladder gaps (FTR and PRC were cut: FTR duplicated the STR; Precondition needs no ladder acronym) |

---

## 7. Decision log

- **A, ratified:** MTP Epic name = `QA Master Test Plan` (keeps the `QA ` process-epic family).
- **B, ratified:** Test Set keeps `Validate`: `TS: {scope}: Validate {feature}` (feature-level only; the per-Story Set is the ATS).
- **C, ratified:** acronym-prefix grammar `{ACRONYM}: {scope}: {desc}` is the single standard for all Plans and Runs.
- **D, ratified:** items-over-fields is the hard default; the Story custom field is a fallback only (with the D5 timing nuance in §4).
- **E, ratified:** Sprint scope-id = `Sprint#{N}` (e.g. `Sprint#30`). The STR title term is `Regression Testing`, not "Sprint Regression Testing", because "Sprint" is already in the scope-id: `STP: Sprint#30: Payments hardening` / `STR: Sprint#30: Regression Testing`.

### Amendments: Session A, 2026-08-21 (`.session/artifact-ladder-refactor/decisions.md`)

- **ATS added:** the per-Story Acceptance Test Set, mandatory, third canonical Story artifact (ATC/ATP/ATR/ATS family). It is Set-first in Stage 1, and its `tests` link to the Story is the coverage backbone.
- **FTR and PRC cut:** FTR duplicated the STR; Precondition stays an entity but needs no ladder acronym.
- **Producers assigned:** MTP by `project-context` mode `test-plan` (file + Epic). FTP by `feature-test-planning` in `/sprint-testing`, item-first. STP by sprint-start find-or-create (`/sprint-testing` Session Start of the first ticket; `/regression-testing` fallback). STR by the sprint-close recap (first to arrive creates it).
- **ATP field-first pre-sprint (D5):** the "ATP DRAFT" identity is dead. Pre-sprint the ATP lives only in `{{jira.acceptance_test_plan}}`, and the item is born in `/sprint-testing` Stage 1.

### Amendment: RTP ratified 2026-09-15

- **RTP added to the ladder:** the long-lived Regression Test Plan the live layer already ran under that full name now carries the ladder acronym, so it reads beside FTP / STP / ATP instead of being invented ad hoc by each reader. There is one per project (or per module), titled `RTP: {PROJECT_KEY|module}: Regression Test Plan` and parented to the QA Master Test Plan Epic. `/test-documentation` produces it as the promotion target for every `regression-candidate` TC, and `/regression-testing` consumes it (the STR derives its test list from the RTP membership). It is the only Plan with no terminal: `ready` on the first promotion, `ready` for the life of the product.

### Amendment: RTR ratified 2026-09-23

- **RTR added to the ladder:** the Regression Test Results, the Runner the RTP row had left empty. It is one Test Execution per regression verdict, `RTR: {scope-id}: Regression Testing`, with scope-id `{env}-{YYYY-MM-DD}` (optional `#2` suffix for a second verdict the same day) or a release tag for a release candidate (`RTR: v2.3.0-rc1: Regression Testing`). It is parented to the QA Test Artifacts Epic, linked to the RTP through the Xray `testPlan` field, and carries its Test Environment and an assignee (self) from creation. It uses the same `test_execution` workflow as STR and ATR (`active` → `complete` → `close`), so the catalog does not change. `/regression-testing` creates it at `active` BEFORE the CI trigger so the run imports into its key, posts the GO / CAUTION / NO-GO comment on it, then closes it. An environment re-run before the verdict imports into the same RTR; a re-run after a verdict is a NEW RTR, never a re-opened one.
- **STR keeps its sprint-close role:** `STR: Sprint#{N}: Regression Testing` stays the recap of the sprint's results, created by whoever arrives first at sprint close, and now carries dual `testPlan` membership: the STP (as before) and the RTP, so the RTP's latest-status rollup includes the sprint-close run. Every other regression run is an RTR.
- **`STP → RTP` roll-up REJECTED:** the RTP is a curated per-TC subset (only Candidate / Manual verdicts are promoted, Deferred never enters), so a sprint plan is not "part of" it. Regression membership is expressed per Test through Test Plan membership plus the `regression-candidate` label, never by chaining sprint plans into the RTP. The results side likewise has no roll-up: no `STR is part of RTR`, no `RTR is part of anything`.
- **Modality jira-native:** no RTR item (there is no Test Execution work type). Skip with a stated note; the results are the per-Test status writes plus the `[LOCAL]` report. This matches the STR rule.
- **CI write-back:** the import target of a run is the RTR of that run, passed per run (a `workflow_dispatch` input over the `STP_EXECUTION_KEY` secret, whose name is kept and whose meaning becomes "the Execution this run imports into"). Smoke and sanity never write into a regression Execution unless a key is passed to them explicitly.
- Rationale, the six decisions and the rejected alternatives: `.context/ADR/ADR-0002-regression-run-record.md`.
