# QA Planning Ladder — Nomenclature Proposal (RATIFIED, pending implementation)

> **Status**: core decisions **RATIFIED** by the user (2026-06-26) — ready to propagate into the
> skills' `references/*.md`, `.agents/project.yaml` (`qa.qa_epics`), the sync script, the
> traceability doctrine, and the Naming Codex deck. Implementation not yet started.
>
> **Ratified decisions**: (A) MTP Epic = **`QA Master Test Plan`** · (B) Test Set keeps **`Validate`**
> → `TS: {scope}: Validate {feature}` · (C) acronym-prefix grammar `{ACRONYM}: {scope}: {desc}`
> **approved** as the single standard · (D) **items-over-fields** confirmed (Test Plan / Test
> Execution issues by excellence; Story custom field = fallback only) · (E) Sprint scope-id =
> **`Sprint#{N}`** (e.g. `Sprint#30`); STR title term = `Regression Testing` ("Sprint" comes from
> the scope-id, no redundancy) → `STR: Sprint#30: Regression Testing`.
>
> **Scope**: the test-PLANNING hierarchy (MTP / FTP / STP / ATP) and its RUNNERS
> (FTR / STR / ATR), the four QA-process Epics that hold them, the Jira-item-over-
> custom-field rule, plus Test Set and Precondition naming. Test-CASE naming
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
4. **The embedded "testing term" maps to the activity.** FTR = *Feature Testing*,
   STR = *Sprint Regression Testing*, ATR = *Story Testing* — the run's title states which
   sprint-testing activity produced it.
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
| **QA Test Artifacts** | `test_artifacts_epic` | every **Test Execution** (FTR · STR · ATR), **Precondition**, **Test Set** | NEW |
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
| FTR | Test Execution | QA Test Artifacts | `is tested by` feature Epic · `testPlan` → FTP |
| STR | Test Execution | QA Test Artifacts | `relates to` Sprint · `testPlan` → STP |
| ATR | Test Execution | QA Test Artifacts | `is tested by` Story · `testPlan` → ATP |
| Test Set | Test Set | QA Test Artifacts | groups Tests by feature/module |
| Precondition | Precondition | QA Test Artifacts | `relates to` the Tests it sets up |
| Test (TC) | Test | QA Test Repository | ATP `designs` · ATR `executes` |
| Bug/Defect/Improvement | Bug/… | QA Defect Management | `is caused by` / `blocks` source Story |

Optional **roll-up links** for coverage aggregation: ATP `is part of` FTP `is part of` STP.
Parent stays the MTP Epic for all Plans regardless of roll-up.

---

## 2. The ladder — Plan + Runner per altitude

| Altitude | Plan | Runner | Jira work type | When / who | Cardinality |
|---|---|---|---|---|---|
| **Product** | **MTP** Master Test Plan | — | **Epic** (+ local file) | bootstrap once; refresh via `/master-test-plan` | 1 per project |
| **Feature / Epic** | **FTP** Feature Test Plan | **FTR** Feature Test Results | Test Plan → Test Execution | `feature-test-planning` (sprint-testing) when a feature enters testing | FTP 1 per feature · FTR ≥1 per sprint ("Feature Testing") |
| **Sprint** | **STP** Sprint Test Plan | **STR** Sprint Test Results | Test Plan → Test Execution | regression-testing at sprint close | 1 per sprint (term: "Regression Testing"; "Sprint" comes from the `Sprint#{N}` scope-id) |
| **User Story** | **ATP** Acceptance Test Plan | **ATR** Acceptance Test Results | Test Plan → Test Execution | sprint-testing S1 (ATP) / S3 (ATR) | ATP 1 per Story · ATR 1 run ("Story Testing") |

---

## 3. The unified title grammar

```
{ACRONYM}: {scope-id}: {descriptor}
```

- **ACRONYM** — `MTP` (epic) · `FTP` · `STP` · `ATP` (plans) · `FTR` · `STR` · `ATR` (runs).
- **scope-id** — the key of the thing under test at that altitude (feature-Epic key, `Sprint N`, Story key).
- **descriptor** — human-readable, embeds the testing-term where the user requires it.

| Artifact | Jira type | Title pattern | Example |
|---|---|---|---|
| **MTP** | Epic | `QA Master Test Plan` (singleton) | `QA Master Test Plan` |
| **FTP** | Test Plan | `FTP: {EPIC-KEY}: {feature}` | `FTP: PROJ-42: Checkout & Payments` |
| **FTR** | Test Execution | `FTR: {EPIC-KEY}: Feature Testing — {feature}{ · run N}` | `FTR: PROJ-42: Feature Testing — Checkout · run 2` |
| **STP** | Test Plan | `STP: Sprint#{N}: Regression` | `STP: Sprint#30: Regression` |
| **STR** | Test Execution | `STR: Sprint#{N}: Regression Testing` | `STR: Sprint#30: Regression Testing` |
| **ATP** | Test Plan | `ATP: {STORY-KEY}: {story title}` | `ATP: PROJ-123: Apply discount at checkout` |
| **ATR** | Test Execution | `ATR: {STORY-KEY}: Story Testing` | `ATR: PROJ-123: Story Testing` |
| **ATP DRAFT** (shift-left) | Test Plan | `ATP: {STORY-KEY}: {story title} (Shift-Left DRAFT)` | `ATP: PROJ-123: Apply discount at checkout (Shift-Left DRAFT)` |

### 3.1 Supporting artifacts (QA Test Artifacts epic)

| Artifact | Jira type | Title pattern | Example | Notes |
|---|---|---|---|---|
| **Test Set** | Test Set | `TS: {EPIC-KEY\|module}: Validate {feature/module}` | `TS: PROJ-42: Validate Checkout` | groups TCs by feature/module; optional but skills must respect + name it this way |
| **Precondition** | Precondition | `PRC: {COMPONENT}: {required state}` | `PRC: Payment: Authenticated user with a saved card` | **title = the state**; **content = the setup steps** (kept distinct) |

> **Decision B — RATIFIED**: Test Set **keeps `Validate`** → `TS: {scope}: Validate {feature}`.
> `Validate` therefore stays the grouping word at BOTH the Jira Test Set layer and code
> `describe()` — fully consistent with the Naming Codex "Validate = group" law. The `TS:`
> prefix adds the work-type/altitude signal on top.

---

## 4. Items over custom fields (standard behavior change)

**By excellence, every Plan and every Run is a real Jira issue** — a **Test Plan** item for
FTP/STP/ATP and a **Test Execution** item for FTR/STR/ATR — in BOTH modalities (these are
native Jira work types in the UPEX workspace, Xray-independent).

**Fallback (degraded mode only):** ATP/ATR MAY live as custom fields on the User Story
**only when** the Test Plan / Test Execution work types are unavailable in the instance and
therefore cannot be created/linked. As soon as the items exist, they are the single source of
truth and the fields are not used.

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
| `Sanity: GX-101: Validate credit card payment` (Test Set) | `TS: GX-101: Validate credit card payment` | Test Sets group by feature/module, not strategy; `TS:` prefix replaces the strategy word |
| `Checkout: Payment: PRC: For credit card flow` | `PRC: Payment: Authenticated user with a saved card` | title states the *state*, not "For <flow>" |
| (nothing) FTP/FTR/STP/STR | new artifacts at Feature & Sprint altitude | fills the ladder gaps |
| `qa.qa_epics` = 2 epics | 4 epics (`+ master_test_plan_epic`, `+ test_artifacts_epic`) | every artifact type gets a home |

---

## 6. Impacted surfaces (for the implementation pass, post-ratification)

- `.agents/project.yaml` — add `qa.qa_epics.master_test_plan_epic` + `test_artifacts_epic`.
- `agentic-qa-core/references/defect-management-doctrine.md` — Part 4 grows 2→4 QA epics.
- `agentic-qa-core/references/traceability-linking.md` — Plan/Run item links, roll-up edges.
- `test-documentation/references/tms-conventions.md` · `tms-architecture.md` · `jira-test-management.md` · `xray-platform.md` — naming + items-over-fields.
- `sprint-testing/references/acceptance-test-planning.md` · `reporting-templates.md` · `SKILL.md` — ATP/ATR items, FTP/FTR (Feature Testing), Story Testing term.
- `shift-left-testing/references/atp-draft-template.md` · `handoff-protocol.md` — ATP DRAFT title.
- `regression-testing/SKILL.md` — STP/STR (Sprint Regression Testing).
- `scripts/sync-jira-issues.ts` — Plan/Run as items; field-fallback precedence.
- `.claude/skills/agentic-qa-core/naming-conventions.html` + `.es.html` — new "Planning Ladder" layer/slide.
- `.agents/jira-required.yaml` / `jira-fields.json` — Test Plan / Test Execution / Test Set / Precondition work-type config.

---

## 7. Decision log

- **A — RATIFIED** — MTP Epic name = `QA Master Test Plan` (keeps the `QA ` process-epic family).
- **B — RATIFIED** — Test Set keeps `Validate` → `TS: {scope}: Validate {feature}`.
- **C — RATIFIED** — acronym-prefix grammar `{ACRONYM}: {scope}: {desc}` is the single standard for all Plans/Runs.
- **D — RATIFIED** — items-over-fields is the hard default; Story custom field = fallback only.
- **E — RATIFIED** — Sprint scope-id = `Sprint#{N}` (e.g. `Sprint#30`). STR title term = `Regression Testing` (not "Sprint Regression Testing" — "Sprint" already in the scope-id). → `STP: Sprint#30: Regression` / `STR: Sprint#30: Regression Testing`.
