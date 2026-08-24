# Defect-Management Doctrine — classifying, reporting, and owning quality issues

> **Canonical, shared doctrine.** Single source of truth for *how* a quality
> issue is classified (Bug / Defect / Improvement), *which fields* a report must
> carry, *who* owns it (QA Assignee), and *where* it is parented (QA process
> epic). Cited by `sprint-testing`, `test-documentation`, `test-automation`, and
> `regression-testing`. Whenever any skill files a quality report or picks up a
> work item to test, this file is the authority. Do not duplicate its content
> into a skill — cite it.

This doctrine is **always in force**, not invoked on demand. A quality issue can
surface mid-sprint, mid-regression, mid-automation, or mid-documentation — the
classification rule, the field matrix, the QA-Assignee semantics, and the epic
attachment rule are **identical everywhere a report can be filed**.

The mechanics of *writing the report body* (templates, repro steps, evidence
capture) live in each skill's own references. **This file governs the upstream
decisions: what type, what fields, who owns it, where it hangs.**

---

## Part 1 — Issue-type classification (Bug vs Defect vs Improvement)

Choosing the issue type is **mandatory and happens BEFORE filing**. The three
types share one Jira workflow (`UPEX BUG/DEFECT LIFE CYCLE`) but mean different
things. Misclassification corrupts every downstream metric (defect-escape rate,
pre-release containment, enhancement backlog).

### The decision rule (binding)

```
Q1. Does the behavior violate an acceptance criterion — explicit OR implied
    (a reasonable-quality expectation a correct system must meet)?
Q2. Is the affected feature ALREADY live in a superior environment
    (production / anything above Staging — visible to the end user)?
```

| Q1 — violates an AC? | Q2 — feature live above Staging? | Type |
|---|---|---|
| Yes | Yes — end user can hit it | **Bug** |
| Yes | No — Staging or below, still pre-release | **Defect** |
| No — works as designed; no AC required it; it is an enhancement | — | **Improvement** |

### The one clause that decides Bug vs Defect (read twice)

> Classification follows the **lifecycle stage of the FEATURE**, not the
> environment where you happened to find the problem.

You may reproduce a failure on `localhost` or in `qa`, yet the broken feature was
just merged to lower environments and **has not reached production**. That is a
**Defect** (of a recently-implemented story in this sprint), not a Bug —
regardless of where you observed it. Inversely, a failure in a feature that is
*already live in production* is a **Bug** even if you first saw it in Staging.

- **Bug** — every feature is presumed to have passed the sprint quality gate
  before release. A failure in a *released* feature escaped that gate → Bug.
- **Defect** — discovered *before* the feature crosses Staging into superior
  environments. This is the normal output of sprint testing: the feature is under
  development, not yet released. Defects are *contained*, not *escaped*.
- **Improvement** — not a broken criterion at all. The system behaves as
  designed, but a test **beyond the AC** (see `test-design-doctrine.md`,
  Principle 2 — ACs are the floor, not the ceiling) reveals a desirable change,
  OR the AC was never specified correctly. Functional or non-functional. It is
  proposed work, treated procedurally like a story but carrying the
  defect-report schema + workflow.

### Cross-story exploration (common case)

Testing Story A you trip over a failure that belongs to Story B. Verify B's
lifecycle stage: if B is in the **same sprint / still pre-release** → file a
**Defect** against B (link to B as the source). If B's feature is **already in
production** → file a **Bug**.

### The Improvement bridge (this is new — `test-design-doctrine.md` is inward-only)

When a test-beyond-AC exposes a gap **because the AC was under-specified or
absent**, the correct artifact is an **Improvement**, not a Bug/Defect — the
system did not violate a criterion that was actually defined. Typical signature:
`root_cause = requirement_error` or `working_as_designed`. The Improvement
proposes the missing behavior (and, where useful, that the source Story's AC set
be extended). Do not silently widen the Story's ACs after the fact — file the
Improvement so the proposal is tracked.

### Reclassification safety net

If something is filed as Bug/Defect but turns out to be an enhancement, use the
`is_not_a_bug` transition (→ `enhancement`) or re-file as Improvement; a genuine
working-as-designed report is closed via `is_wad` (→ `rejected`). Prefer
classifying correctly **up front** — the transitions are a fallback, not the plan.

---

## Part 2 — QA Assignee (the quality owner of the issue)

`qa_assignee` (`{{jira.qa_assignee}}`, single User Picker) names the QA who owns
testing for an issue. It is the QA-lane parallel of the native `assignee` (the
dev owner) and is **distinct from `reporter`** — the person who *raised* an issue
is often not the person who *retests* it. That gap is exactly why this field
exists and why it carries the per-issue QA accountability that `reporter` cannot.

### Scope — nearly every work item, not just bugs

QA Assignee is set on **all work-type issues**: `story`, `tech_story`,
`tech_debt`, `bug`, `defect`, `improvement`. (Not on Xray container issues or
Test cases — those route through the Test Repository epic, Part 4.)

### When to set it (binding)

- **On first pickup of a work item to test** — when a QA starts working a Story
  (or tech-story / tech-debt) for QA, set `qa_assignee` to themselves. Setting it
  is part of *taking* the ticket, the same moment you transition it into testing.
- **On filing any Bug / Defect / Improvement** — set `qa_assignee` to the QA who
  is filing (the same authenticated identity creating the report).

### Who is "the QA" (binding)

> The QA Assignee is the **authenticated user of the CLI / MCP session** doing
> the work — you assign *yourself*. There is no identity variable to configure;
> it is whoever's Atlassian account the tool is authenticated as, exactly as that
> account becomes the `reporter` of anything it creates.

### Never-overwrite (binding)

If `qa_assignee` is **already set to another person, do NOT overwrite it.** Each
issue has its own QA owner; clobbering it destroys accountability and metrics.

- Only replace an existing QA Assignee when the **user explicitly instructs it**
  with a reason (e.g. the assigned QA cannot run the test and is handing the
  issue over). Record the handover rationale.
- Mechanically this requires **read-before-write**: read the current value first;
  write only if empty (or on explicit, justified override). The REST writer
  (Part 6) enforces this — never blind-set the field.

---

## Part 3 — Components (the affected product area)

`components` is a **native Jira field** (not a custom field — it is set directly,
not via `{{jira.*}}`). It is **mandatory** on every Bug / Defect / Improvement
**and on every `Test`**, and is the primary grouping axis for quality metrics,
JQL filters, and dashboards.

- **Convention (binding): one component = one functional module of the
  application.** Components mirror the app's real surface — routes, features,
  bounded areas of the source (`/checkout/cart` → `Cart`, `/auth/login` →
  `Login`) — not the planning taxonomy. Deliberately finer-grained than the
  product Epics: an Epic is a unit of work, a component is a unit of the running
  system, and a filter is only as useful as it is discriminating. Set the
  component to the area the issue or test *touches*.
- **A component may be declared ahead of the code.** "Mirrors the app's surface"
  describes the *shape* of a component, not a precondition that the module already
  ships. A feature under refinement has Stories, ACs and often Tests before it has
  a route, and all of them need somewhere to hang — refusing to name the component
  until the code lands leaves that work uncomponented exactly when planning
  metrics would be useful. Declare it when the module becomes a known part of the
  product, and treat the source as evidence of what exists rather than as the
  gate.
  The reconciler is built for this: it is re-run as the map evolves, `create` is
  additive, and `rename` re-labels a component without touching a single issue
  assignment. So a forward-declared component costs nothing if the feature ships
  under a different name, and nothing if it never ships at all.
- **Components must pre-exist.** Their options are defined in the project's
  *Components* admin module, not from the issue dropdown; Jira rejects unknown
  names. `acli` cannot create or edit them (`acli/SKILL.md` §Hard limits), so
  populating them is either an admin task or a REST operation — driven by
  `scripts/sync-jira-components.ts` through the `/jira-components` command,
  which is plan-based on purpose: the AI proposes the module map, a human
  approves it, and only the approved plan is written. Renaming (which preserves
  issue assignments) is a separate operation from creating.
  The module map is proposed from **two** inputs, not one: the app's source
  (what exists) and the backlog's own scope — Epics and Stories describing work
  not yet built (what is coming). Deriving from source alone silently drops every
  planned module, which shows up later as an issue nobody can classify.
- **Prefix components with the product name when the product's domain
  vocabulary overlaps QA's** (conditional recommendation, not a blanket rule).
  A test-management product has features literally named Tests, Runs, Bugs — so
  a component called `Tests` is ambiguous: the product's Tests feature, or the
  QA artifacts about the product? Prefixing with the product name (`Bunkai
  Tests`, `Bunkai Runs`) removes the ambiguity. The overlap is the normal case
  for developer tools, testing products, and project-management products; it is
  absent for, say, an e-commerce site, where `Checkout` collides with nothing
  and the prefix is just noise. The AI raises this with the user when it
  detects the overlap while proposing a component plan — it does not apply the
  prefix silently.
- **Multiple components are allowed** when an issue genuinely spans areas; prefer
  the single most-affected module otherwise. On a `Test`, they are metadata that
  travels in the synced `.md` — placement on disk follows the covering Story, so
  a Test spanning two modules costs nothing.
- Components answer **"what part of the product broke"** — a different axis from
  `parent` (**"which QA bucket tracks it"**, Part 4). Do not conflate them.

---

## Part 4 — QA process epics & the three-axis model

Bugs, Defects, Improvements, and Test cases are **QA process artifacts**, not
product backlog. They must NOT be parented to a product / development Epic —
doing so pollutes story-level roadmap and burndown metrics. Instead they hang
from a dedicated **QA process epic**, while their product area and source are
carried by the *other two axes*.

### The three axes (keep them separate)

```
parent / Epic Link  ->  QA PROCESS EPIC      ("which QA bucket tracks this")
issue link          ->  SOURCE story/feature ("what this came from" — traceability)
components          ->  PRODUCT module/epic  ("what part of the product it affects")
```

- **parent** = the QA process epic (below). Never a product/dev epic.
- **issue link** = the originating Story/feature via the causal/coverage link
  (`problem_incident` → *causes* / *is caused by*; `blocks` when it gates a
  release; `test` for container→Story coverage — the per-Story **ATS**→Story
  link is the coverage-bearing edge, live-verified; ATP→Story / ATR→Story are
  administrative; direct TC→Story is the cascade's last resort — see
  `traceability-linking.md` §3). Traceability is preserved here, NOT
  via the parent.
- **components** = the affected product area (Part 3).

### The four QA process epics

| Epic | Holds | Project-configured name |
|---|---|---|
| **Master Test Plan epic** | every **Test Plan** (FTP/STP/ATP) | `qa.qa_epics.master_test_plan_epic.name` — **"QA Master Test Plan"** |
| **Test Repository epic** | every **Test** (TC) | `qa.qa_epics.test_repository_epic.name` — **"QA Test Repository"** |
| **Test Artifacts epic** | every **Test Execution** (STR/ATR), **Precondition**, and **Test Set** — both the per-Story **ATS** (`ATS: {US_ID}: {story title}` — MANDATORY per Story, components INHERITED from the Story) and the optional feature-level **`TS:`** (`TS: {EPIC\|module}: Validate {feature}` — components optional, may cross modules) | `qa.qa_epics.test_artifacts_epic.name` — **"QA Test Artifacts"** |
| **Defect epic** | every **bug/defect/improvement** | `qa.qa_epics.defect_epic.name` — **"QA Defect Management"** |

- The **Master Test Plan epic has a special role**: it is an **Epic** (not a Test
  Plan work type), is the **parent of all Test Plans** (FTP/STP/ATP), mirrors
  `.context/master-test-plan.md` + points to the official QA team repository, and is
  cross-linked (`relates to`) to its three sibling QA epics (Test Repository, Test
  Artifacts, Defect Management) — so the four form a navigable QA-governance cluster.
- **Test Sets split by altitude.** The per-Story **ATS** (Acceptance Test Set,
  `ATS: {US_ID}: {story title}`) is a MANDATORY canonical artifact — one per
  Story, even for a single Test — and inherits its **components from the Story**
  (mandatory, like ATP/ATR). The components exemption applies ONLY to the
  optional feature-level **`TS:`** set (`TS: {EPIC|module}: Validate {feature}`),
  which may legitimately cross modules (smoke / regression / feature grouping).
  Both altitudes parent to the **Test Artifacts epic**; the ATS additionally
  carries the coverage-bearing `test` link to its Story
  (`traceability-linking.md` §3).
- The **`QA `/ project prefix is deliberate**: a reader scanning epics sees `QA …`
  and knows it is a *process* epic, not a product feature.
- Epic identity (name + key) is configured per project in `.agents/project.yaml`
  under `qa.qa_epics:` — never hardcode it in skill content. Resolve by the
  configured name; the resolver finds-or-creates and caches the key.

#### Every QA process epic carries the `{{QA_ARTIFACT_LABEL}}` label (binding)

Apply it at creation time, on all four. It is what tells tooling that an Epic is a
QA bucket rather than a product module: `scripts/sync-jira-issues.ts` reads it to
keep these Epics out of `.context/PBI/epics/`, which is the product tree, and index
them under `qa-artifacts/` instead. Without the label they land beside real product
Epics as near-empty folders, because a Story query against a process epic returns
nothing.

The label is the primary signal precisely because the other two are weaker. The
cached `qa.qa_epics.*.key` values are `null` until a skill discovers them, so they
cover nothing on a fresh project. The `QA ` name prefix is a guess that misfires on
a product Epic legitimately named "QA Tooling" — the sync falls back to it and
reports when it does, so a run that mentions the fallback is asking for this label.

```
[ISSUE_TRACKER_TOOL] Create Issue:
  type: Epic
  summary: {{jira.qa_epics.<slug>.name}}
  labels: [{{QA_ARTIFACT_LABEL}}]
```

Adding it to an Epic that already exists is a one-field edit and is worth doing the
first time a sync reports the name-prefix fallback.

### Find-or-create (binding setup behavior)

When a skill is about to file a Bug/Defect/Improvement (or a Test), it resolves
the relevant process epic by the configured name:

1. **Exists** → parent the new issue to it. (This is the steady state.)
2. **Absent** → create it once as the project's QA process epic, write the
   project's defect-management (or test-repository) **strategy summary into the
   epic description**, record its key into `.agents/project.yaml`
   `qa.qa_epics.<epic>.key`, then parent. One-time bootstrap, not a per-issue action.

> The QA process epics are **excluded from the Components module** — they are
> process buckets, never selectable as a product component (Part 3).

---

## Part 5 — Mandatory field matrix

Filling the report richly is not optional polish — these fields *are* the
defect-management metrics (JQL filters, dashboards, escape/containment rates).
A report that skips them is incomplete.

| Field | Slug / native | Required | Source |
|---|---|---|---|
| Summary | `summary` | ✅ | `<EPIC>: <COMPONENT>: <what failed>` |
| Description (steps to repro) | `description` | ✅ | authored |
| Actual result | `{{jira.actual_result}}` | ✅ | observed |
| Expected result | `{{jira.expected_result}}` | ✅ | per AC / correct behavior |
| Severity | `{{jira.severity}}` | ✅ | impact-based (Part 5.1) |
| Priority | native `priority` | ✅ | auto-derived from Severity (Part 5.1) |
| Components | native `components` | ✅ | affected product module (Part 3) |
| Root cause | `{{jira.root_cause}}` | ✅* | set after diagnosis (*at-fix if unknown at filing) |
| Error type | `{{jira.error_type}}` | ✅ | functional/visual/.../security |
| Test environment | `{{jira.test_environment}}` | ✅ | where reproduced |
| QA Assignee | `{{jira.qa_assignee}}` | ✅ | self, never-overwrite (Part 2) |
| Evidence | `{{jira.evidence}}` | ✅ | screenshots / traces / logs |
| Workaround | `{{jira.workaround}}` | ➖ | if a mitigation exists |
| Fix (bugfix/hotfix) | `{{jira.fix}}` | ➖ | set at fix time |
| Parent | native `parent` | ✅ | QA process epic (Part 4) |
| Source link | `{{jira.link_types.problem_incident}}` etc. | ✅ | originating Story (Part 4) |

Any required field absent from the instance falls back to a structured comment
per its `fallback:` in `.agents/jira-required.yaml` — never block on a missing
field.

### Part 5.1 — Severity → Priority (auto-derive, override allowed)

`priority` is auto-set from `severity` by this matrix; the QA may override with a
one-line justification when business urgency diverges from technical severity
(e.g. a `trivial`-severity typo in the landing hero may warrant `High` priority).

| Severity (`{{jira.severity}}`) | Priority (native) |
|---|---|
| `critica` | Highest |
| `mayor` | High |
| `moderada` | Medium |
| `menor` | Low |
| `trivial` | Lowest |

---

## Part 6 — Write mechanics (acli + REST — no bespoke tooling)

Filing uses the existing tooling; there is no special defect-management binary.
Load `/acli` first — it owns the syntax, auth, and the REST-PUT pattern below.

- **Create** the issue with acli `workitem create --from-json`, passing create-time
  custom fields under `additionalAttributes.{customfield_NNNNN}` (reference each by
  its `{{jira.<slug>}}` token, e.g. `{{jira.qa_assignee}}`) and the native
  `components: [{ "name": "<pre-existing>" }]` array. Round-trip-validate the
  components key on first use.
- **acli `workitem edit` cannot set custom fields or `components`** (exit 1). To set
  or change a custom field / component on an EXISTING issue, use REST
  `PUT /rest/api/3/issue/{KEY}` with `{ "fields": { … } }` — pattern + the
  `--out/--in` link-inversion gotcha live in the /acli skill's
  `references/acli-integration.md`.
- **Never-overwrite (Part 2) = read-before-write**: read the issue's current
  `qa_assignee` (from the synced `.md` or a GET) BEFORE setting it; write only when
  empty, or on an explicit, justified handover.
- **Find-or-create the QA process epic** with acli: JQL-search by the configured
  `qa.qa_epics.*.name`; if absent, `workitem create --type Epic` (write the strategy
  summary into its description), then parent the issue and cache the new key into
  `.agents/project.yaml` `qa.qa_epics.*.key`.

---

## Part 7 — Where this fires (per skill)

- **`/sprint-testing`** — primary filer. Sets `qa_assignee` when a Story is taken
  into testing (Stage 1); classifies + files Bug/Defect/Improvement with the full
  matrix in Stage 3; parents to the Defect epic; links to the source Story.
- **`/regression-testing`** — a regression failure is classified and filed **in
  Jira** (Bug if the feature is live above Staging, Defect if pre-release) with
  the full matrix — *not* a GitHub issue.
- **`/test-automation`** — on exposing a real product issue, classifies, then
  delegates filing (carrying the classification + fields) and records the key.
- **`/test-documentation`** — files no Bugs, but parents every `Test` it creates
  to the **Test Repository epic** (Part 4), sets `components`, and may raise an
  **Improvement** when a test-beyond-AC reveals an under-specified AC (Part 1).

---

## Part 8 — Anti-patterns (the drift this doctrine stops)

```
[x] Bug/Defect/Improvement parented to a product/dev Epic     -> use the QA process epic
[x] Empty components on a quality report                       -> components are mandatory
[x] Overwriting an existing QA Assignee silently              -> never-overwrite (Part 2)
[x] Filing "Bug" for a pre-release failure                    -> it is a Defect (Part 1)
[x] Filing "Defect" for a production-live failure             -> it is a Bug (Part 1)
[x] Widening a Story's ACs silently after a test finds a gap  -> file an Improvement
[x] Reporting "% of ACs verified" as completeness            -> see test-design-doctrine.md
```

---

## Part 9 — Filing gate (the checklist)

Run before submitting any Bug / Defect / Improvement. A report that cannot answer
YES (or justified N/A) to each is not done.

```
[ ] TYPE  Classified Bug vs Defect vs Improvement by feature lifecycle, not by
          where it was found? (Part 1)
[ ] OWNER QA Assignee set to me, and I did NOT overwrite an existing owner? (Part 2)
[ ] COMP  Components set to the affected product module (pre-existing)? (Part 3)
[ ] EPIC  Parented to the QA process epic (found-or-created), NOT a product epic? (Part 4)
[ ] LINK  Linked to the source Story/feature for traceability? (Part 4)
[ ] FIELD Severity + Priority(auto) + Error Type + Environment + Actual/Expected
          + Evidence all filled (or fallback comment)? (Part 5)
[ ] ROOT  Root cause set now, or flagged to set at fix time? (Part 5)
```
