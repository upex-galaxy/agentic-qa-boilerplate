# QA Planning Ladder — Nomenclature Proposal (RATIFIED, amended 2026-08-21)

> **Status**: core decisions **RATIFIED** by the user (2026-06-26) and most of §6 has **LANDED**:
> the four QA-process Epics, the acronym grammar, ATP/ATR items and Test Set naming are live in
> the skills' `references/*.md`, `.agents/project.yaml` (`qa.qa_epics`) and the docs.
> **Amended 2026-08-21** (Session-A decisions, `.session/artifact-ladder-refactor/decisions.md`):
> the **ATS** rung (per-Story Acceptance Test Set) is added, **FTR and PRC are cut** from the
> ladder, FTP/STP/STR/MTP get real producers, and the ATP becomes **field-first pre-sprint**
> (the Test Plan item is born in `/sprint-testing` Stage 1). Remaining gaps are code-side
> (sync altitude-awareness, xray CLI coverage writes — Session B).
>
> **Ratified decisions**: (A) MTP Epic = **`QA Master Test Plan`** · (B) Test Set keeps **`Validate`**
> → `TS: {scope}: Validate {feature}` (feature-level only; the per-Story Set is the **ATS**) ·
> (C) acronym-prefix grammar `{ACRONYM}: {scope}: {desc}` **approved** as the single standard ·
> (D) **items-over-fields** confirmed (Test Plan / Test Execution issues by excellence; Story
> custom field = fallback only — with the D5 timing nuance: pre-sprint the ATP lives ONLY in the
> field) · (E) Sprint scope-id = **`Sprint#{N}`** (e.g. `Sprint#30`); STR title term =
> `Regression Testing` ("Sprint" comes from the scope-id, no redundancy) →
> `STR: Sprint#30: Regression Testing`.
>
> **Scope**: the test-PLANNING hierarchy (MTP / FTP / STP / ATP) and its RUNNERS
> (STR / ATR), the **ATS** coverage rung, the four QA-process Epics that hold them, the
> Jira-item-over-custom-field rule, plus Test Set naming. Test-CASE naming
> (`should …`), `@atc`, components, tags, branches — already ratified, see the Naming Codex.

---

## 0. Design goals (the justification, up front)

1. **One grammar, every altitude.** Today the same Jira "Test Plan" work type is titled
   three different ways (`Test Plan: PROJ-123`, `QA: TestPlan: Regression S50`,
   `<Strategy>: <ID>: <sum>`). A reader/JQL cannot tell altitude from the title. The
   proposal gives every Plan and Run a **3-letter acronym prefix** so altitude + plan-vs-run
   is legible in the first token and pairs Plan↔Run visually.
2. **Items, not fields, by excellence.** A dedicated Jira issue gives real issue-links,
   an independent status lifecycle, run history, and zero Story-field bloat. Custom fields
   on the Story become a *degraded fallback*, used only when the instance lacks the work type.
3. **Everything has exactly one home + cross-links (3-axis, extended).** The repo already
   parents quality issues to a *QA-process Epic* (not a product Epic) and carries source via
   an issue-link and product area via components. We extend that proven model from 2
   governance Epics to 4 — so Plans, Runs, Test Cases, Artifacts and Defects each have one
   bucket, and traceability stays on the link axis.
4. **The embedded "testing term" maps to the activity.** STR = *Sprint Regression Testing*,
   ATR = *Story Testing* — the run's title states which sprint-testing activity produced it.
5. **Xray-agnostic.** Test Plan / Test Execution / Test Set / Precondition are native Jira
   work types in the UPEX workspace whether or not Xray is installed. The standard therefore
   does not branch on modality for *structure* — only Xray's run/coverage engine is optional.

---

## 1. The four QA-process Epics (extends the existing 3-axis model)

The repo already defines two QA-process Epics in `.agents/project.yaml` under `qa.qa_epics`:
**QA Defect Management** and **QA Test Repository**. This proposal adds two more so every
QA artifact type has a dedicated governance Epic.

| QA-process Epic | `qa.qa_epics.<key>` | Holds (child work types) | Status |
|---|---|---|---|
| **QA Master Test Plan** (the MTP) | `master_test_plan_epic` | every **Test Plan** (FTP · STP · ATP) | NEW |
| **QA Test Repository** | `test_repository_epic` | every **Test** (Test Case) | exists |
| **QA Test Artifacts** | `test_artifacts_epic` | every **Test Execution** (STR · ATR), **Precondition**, **Test Set** (ATS · TS) | NEW |
| **QA Defect Management** | `defect_epic` | every **Bug / Defect / Improvement** | exists |

**The `QA ` prefix is deliberate** (existing convention): a reader scanning the Epic list
sees `QA …` and knows it is a *process* Epic, not a product feature. The MTP Epic therefore
reads **`QA Master Test Plan`** for family consistency (the user's intent — "Master Test Plan
+ QA Engineering hub" — is captured in the Epic *description*, see §1.1). All four are
**excluded from the Components module** (process buckets, never a selectable product component).

> **Decision A — RATIFIED**: MTP Epic name = **`QA Master Test Plan`** (keeps the `QA ` family).
> The "QA Engineering hub + official QA repo" intent lives in the Epic description (§1.1).

### 1.1 The MTP Epic — special role

`QA Master Test Plan` is **both** an Epic **and** the local file `.context/master-test-plan.md`
(they mirror each other). The Epic is NOT a Test Plan work type — it is the umbrella Epic
whose **children are every Test Plan in the project** (FTP/STP/ATP). Its description holds:

- the master test strategy (same content as `.context/master-test-plan.md`: what to test, why,
  risk ranking, regression Epic pointer, pass-rate SLOs);
- a pointer to the **official QA team repository** (this boilerplate clone — the home of
  Agentic Testing + Test Automation for the project).

It is **cross-linked to its three sibling QA Epics** (`relates to`): QA Test Repository,
QA Test Artifacts, QA Defect Management — so the four form a navigable QA-governance cluster.

### 1.2 The three axes per artifact (unchanged model, extended buckets)

```
parent / Epic Link  ->  QA-PROCESS EPIC   (which QA bucket tracks this)
issue link          ->  SCOPE under test  (Story / feature-Epic / Sprint — traceability)
components          ->  PRODUCT module     (what part of the product it touches)
```

| Artifact | Work type | Parent Epic (axis 1) | Issue-link / scope (axis 2) |
|---|---|---|---|
| MTP | **Epic** | — (top of the QA cluster) | `relates to` the 3 sibling QA Epics |
| FTP | Test Plan | QA Master Test Plan | `tests` the product **feature Epic** |
| STP | Test Plan | QA Master Test Plan | `relates to` the **Sprint** (+ regression scope) |
| ATP | Test Plan | QA Master Test Plan | `tests` the **User Story** |
| STR | Test Execution | QA Test Artifacts | `relates to` Sprint · `testPlan` → STP |
| ATR | Test Execution | QA Test Artifacts | `is tested by` Story · `testPlan` → ATP |
| ATS | Test Set | QA Test Artifacts | `tests` the **User Story** — **this link is what fills the coverage panel** |
| TS (feature-level) | Test Set | QA Test Artifacts | groups Tests by feature/module (optional) |
| Precondition | Precondition | QA Test Artifacts | `relates to` the Tests it sets up |
| Test (TC) | Test | QA Test Repository | ATP `designs` · ATR `executes` |
| Bug/Defect/Improvement | Bug/… | QA Defect Management | `is caused by` / `blocks` source Story |

Optional **roll-up links** for coverage aggregation: ATP `is part of` FTP `is part of` STP.
Parent stays the MTP Epic for all Plans regardless of roll-up.

> **Coverage evidence (verified live, 2026-08-21 — see `.session/artifact-ladder-refactor/scoping.md`
> §Verificación)**: the **ATS→Story** `Test` link (inward `is tested by`) is what fills the Xray
> coverage panel — a Story linked to a Test Plan (16 tests) + Test Execution (16 tests) still
> shows **UNCOVERED, 0 tests**. The ATP→Story and ATR→Story links are **administrative
> traceability only**. Direct TC→Story links also provide coverage, but only as the last-resort
> step of the resolution cascade (`TC → ATS → Story` → `TC → ATP → Story` → `TC → Story` → orphan).

---

## 2. The ladder — Plan + Runner per altitude

| Altitude | Plan | Runner | Jira work type | When / who | Cardinality |
|---|---|---|---|---|---|
| **Product** | **MTP** Master Test Plan | — | **Epic** (+ local file) | `/master-test-plan` produces BOTH the real file (`.context/master-test-plan.md`) AND the `QA Master Test Plan` Epic with mirror description + cross-links to the 3 sibling QA Epics | 1 per project |
| **Feature / Epic** | **FTP** Feature Test Plan | — (FTR cut: it duplicated the STR) | Test Plan | find-or-create/update when `/sprint-testing` loads the Story's Epic context (`feature-test-planning`); consumed as context from then on. Item-first; Epic field `feature_test_plan` = fallback | 1 per feature |
| **Sprint** | **STP** Sprint Test Plan | **STR** Sprint Test Results | Test Plan → Test Execution | **STP** created at sprint START — find-or-create in the Session Start of the FIRST sprint ticket in `/sprint-testing` (fallback: `/regression-testing` creates it when running suites); a LIVING planner updated per tested ticket, closed at sprint end. **STR** created at sprint CLOSE as the recap of all results (`/sprint-testing` batch-close or `/regression-testing` — first to arrive creates it, the other completes it) | 1 per sprint (term: "Regression Testing"; "Sprint" comes from the `Sprint#{N}` scope-id) |
| **User Story** | **ATP** Acceptance Test Plan | **ATR** Acceptance Test Results | Test Plan → Test Execution | pre-sprint the ATP lives ONLY in `{{jira.acceptance_test_plan}}` (authored by `/shift-left-testing`); the Test Plan ITEM is born in sprint-testing S1 from that field. ATR item created in S1, filled in S3 | ATP 1 per Story · ATR 1 run ("Story Testing") |
| **User Story (coverage)** | **ATS** Acceptance Test Set | — (membership, not a run) | Test Set | sprint-testing S1, **Set-first**: create/update the ATS with the TCs BEFORE the ATP/ATR items — Plan and Exec derive their test lists from the ATS membership | 1 per Story, **mandatory** (even with a single TC) |

---

## 3. The unified title grammar

```
{ACRONYM}: {scope-id}: {descriptor}
```

- **ACRONYM** — `MTP` (epic) · `FTP` · `STP` · `ATP` (plans) · `STR` · `ATR` (runs) · `ATS` (per-Story Test Set — the ATC/ATP/ATR/ATS family).
- **scope-id** — the key of the thing under test at that altitude (feature-Epic key, `Sprint N`, Story key).
- **descriptor** — human-readable, embeds the testing-term where the user requires it.

| Artifact | Jira type | Title pattern | Example |
|---|---|---|---|
| **MTP** | Epic | `QA Master Test Plan` (singleton) | `QA Master Test Plan` |
| **FTP** | Test Plan | `FTP: {EPIC-KEY}: {feature}` | `FTP: PROJ-42: Checkout & Payments` |
| **STP** | Test Plan | `STP: Sprint#{N}: Regression` | `STP: Sprint#30: Regression` |
| **STR** | Test Execution | `STR: Sprint#{N}: Regression Testing` | `STR: Sprint#30: Regression Testing` |
| **ATP** | Test Plan | `ATP: {STORY-KEY}: {story title}` | `ATP: PROJ-123: Apply discount at checkout` |
| **ATR** | Test Execution | `ATR: {STORY-KEY}: Story Testing` | `ATR: PROJ-123: Story Testing` |
| **ATS** | Test Set | `ATS: {STORY-KEY}: {story title}` | `ATS: PROJ-123: Apply discount at checkout` |

> **No "ATP DRAFT" variant exists.** The pre-sprint pass (`/shift-left-testing`) authors the ATP
> at outline maturity **into the `{{jira.acceptance_test_plan}}` custom field only** — no Test
> Plan item, no title variant. The item above is created by `/sprint-testing` Stage 1 from that
> field, under the SAME title grammar. The pre-sprint pass is marked by the labels
> `shift-left-reviewed` + `shift-left-{YYYY-MM-DD}`, not by a DRAFT title.

### 3.1 Supporting artifacts (QA Test Artifacts epic)

| Artifact | Jira type | Title pattern | Example | Notes |
|---|---|---|---|---|
| **ATS** (per-Story) | Test Set | `ATS: {STORY-KEY}: {story title}` | `ATS: PROJ-123: Apply discount at checkout` | **mandatory, 1 per Story** (even with a single TC). Parent: QA Test Artifacts. **Components inherited from the Story (mandatory)**. Its `tests` link to the Story fills the coverage panel; Plan/Exec test lists derive from its membership |
| **TS** (feature-level) | Test Set | `TS: {EPIC-KEY\|module}: Validate {feature/module}` | `TS: PROJ-42: Validate Checkout` | groups TCs by feature/module for smoke / regression / feature grouping; **optional**; components optional (may cross modules) |

> **ATS membership per modality**: in **jira-xray** modality `TC ∈ ATS` is **Xray-internal**
> (GraphQL associations — `addTestsToTestSet` / `getTestSet`), NEVER expressed as an issue link.
> In **jira-native** modality (no Xray layer) the membership IS expressed as `TC→ATS` issue links
> (explicit carve-out), plus the `ATS→Story` link. An instance without the Test Set work type has
> no ATS: fallback = direct `TC→Story` links (the cascade resolves them as its last step).

> **Decision B — RATIFIED (rescoped 2026-08-21)**: the feature-level Test Set **keeps `Validate`**
> → `TS: {scope}: Validate {feature}`. `Validate` therefore stays the grouping word at BOTH the
> Jira Test Set layer and code `describe()` — fully consistent with the Naming Codex
> "Validate = group" law. The `TS:` prefix adds the work-type/altitude signal on top. The
> per-Story **ATS does NOT use `Validate`** — its descriptor is the story title.

> **Precondition** remains a native Jira/Xray entity (parented under QA Test Artifacts) but
> carries **no ladder acronym**: the former `PRC:` prefix is retired.

---

## 4. Items over custom fields (standard behavior change)

**By excellence, every Plan and every Run is a real Jira issue** — a **Test Plan** item for
FTP/STP/ATP and a **Test Execution** item for STR/ATR — in BOTH modalities (these are
native Jira work types in the UPEX workspace, Xray-independent).

**Fallback (degraded mode only):** ATP/ATR MAY live as custom fields on the User Story
**only when** the Test Plan / Test Execution work types are unavailable in the instance and
therefore cannot be created/linked. As soon as the items exist, they are the single source of
truth and the fields are not used.

**Timing nuance (D5, 2026-08-21)**: PRE-SPRINT the ATP lives ONLY in the
`{{jira.acceptance_test_plan}}` custom field — `/shift-left-testing` does NOT create the Test
Plan item ("don't spend artifacts early"). The item is born in `/sprint-testing` Stage 1 from
that field, and from then on the items-first rule above applies unchanged.

**Why:** dedicated items give real issue-links (Plan→scope, Run→Plan, Run→TC), an independent
status lifecycle and run history, and avoid Story-field bloat. It also collapses the
`jira-xray` vs `jira-native` structural split — both create items; Xray only adds the
run/coverage engine on top.

---

## 5. What changes vs today (migration map)

| Today | Becomes | Why |
|---|---|---|
| `Test Plan: PROJ-123` (ATP, often a Story field) | `ATP: PROJ-123: {title}` (Test Plan item; field = fallback) | acronym grammar + items-first |
| `Test Results: PROJ-123` (ATR field) | `ATR: PROJ-123: Story Testing` (Test Execution item) | acronym grammar + items-first + activity term |
| `QA: TestPlan: Regression S50` (strategy plan) | `STP: Sprint#30: Regression` | folds the "strategy plan" into the Sprint altitude |
| `Regression: TP-50: Sprint 50 Regression` (exec) | `STR: Sprint#30: Regression Testing` | acronym grammar; "Sprint" comes from the scope-id |
| `Sanity: GX-101: Validate credit card payment` (Test Set) | `TS: GX-101: Validate credit card payment` | feature-level Test Sets group by feature/module, not strategy; `TS:` prefix replaces the strategy word |
| `Suite: {STORY-KEY}` (per-Story Set) | `ATS: {STORY-KEY}: {story title}` | the `Suite:` prefix dies; the per-Story Set becomes the mandatory ATS coverage rung |
| (nothing) FTP/STP/STR | new artifacts at Feature & Sprint altitude | fills the ladder gaps (FTR and PRC were cut: FTR duplicated the STR; Precondition needs no ladder acronym) |
| `qa.qa_epics` = 2 epics | 4 epics (`+ master_test_plan_epic`, `+ test_artifacts_epic`) | every artifact type gets a home |

---

## 6. Impacted surfaces (for the implementation pass, post-ratification)

- `.agents/project.yaml` — add `qa.qa_epics.master_test_plan_epic` + `test_artifacts_epic`.
- `agentic-qa-core/references/defect-management-doctrine.md` — Part 4 grows 2→4 QA epics.
- `agentic-qa-core/references/traceability-linking.md` — Plan/Run item links, roll-up edges.
- `test-documentation/references/tms-conventions.md` · `tms-architecture.md` · `jira-test-management.md` · `xray-platform.md` — naming + items-over-fields.
- `sprint-testing/references/acceptance-test-planning.md` · `reporting-templates.md` · `SKILL.md` — ATP/ATR items, ATS Set-first order, FTP (feature-test-planning), Story Testing term.
- `shift-left-testing/references/atp-outline-template.md` · `handoff-protocol.md` — pre-sprint ATP (field-first, outline maturity).
- `regression-testing/SKILL.md` — STP/STR (Sprint Regression Testing).
- `scripts/sync-jira-issues.ts` — Plan/Run as items; field-fallback precedence.
- `packages/decks/agentic-qa-core/naming-conventions.es.html` — new "Planning Ladder" layer/slide.
- `.agents/jira-required.yaml` / `jira-fields.json` — Test Plan / Test Execution / Test Set / Precondition work-type config.

---

## 7. Decision log

- **A — RATIFIED** — MTP Epic name = `QA Master Test Plan` (keeps the `QA ` process-epic family).
- **B — RATIFIED** — Test Set keeps `Validate` → `TS: {scope}: Validate {feature}`.
- **C — RATIFIED** — acronym-prefix grammar `{ACRONYM}: {scope}: {desc}` is the single standard for all Plans/Runs.
- **D — RATIFIED** — items-over-fields is the hard default; Story custom field = fallback only.
- **E — RATIFIED** — Sprint scope-id = `Sprint#{N}` (e.g. `Sprint#30`). STR title term = `Regression Testing` (not "Sprint Regression Testing" — "Sprint" already in the scope-id). → `STP: Sprint#30: Regression` / `STR: Sprint#30: Regression Testing`.

### Amendments — Session A, 2026-08-21 (`.session/artifact-ladder-refactor/decisions.md`)

- **ATS added** — per-Story Acceptance Test Set, mandatory, third canonical Story artifact (ATC/ATP/ATR/ATS family). Set-first in Stage 1; its `tests` link to the Story is the coverage backbone.
- **FTR and PRC cut** — FTR duplicated the STR; Precondition stays an entity but needs no ladder acronym.
- **Producers assigned** — MTP: `/master-test-plan` (file + Epic). FTP: `feature-test-planning` in `/sprint-testing`, item-first. STP: sprint-start find-or-create (`/sprint-testing` Session Start of the first ticket; `/regression-testing` fallback). STR: sprint-close recap (first-to-arrive creates).
- **ATP field-first pre-sprint (D5)** — the "ATP DRAFT" identity is dead; pre-sprint the ATP lives only in `{{jira.acceptance_test_plan}}`, the item is born in `/sprint-testing` Stage 1.
