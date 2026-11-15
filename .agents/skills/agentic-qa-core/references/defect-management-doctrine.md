# Defect-Management Doctrine: classifying, reporting, and owning quality issues

> Shared doctrine, cited by `sprint-testing`, `test-documentation`, `test-automation` and `regression-testing`. It decides how a quality issue is classified (Bug, Defect or Improvement), which fields a report carries, who owns it (the QA Assignee) and which QA process epic it hangs from. Whenever a skill files a quality report or picks up a work item to test, this file is the authority. Cite it from a skill instead of copying it.

A quality issue can surface mid-sprint, mid-regression, mid-automation or mid-documentation, and the rules below are the same wherever it is filed. How to write the report body (templates, repro steps, evidence capture) lives in each skill's own references.

---

## Part 1: Issue-type classification (Bug vs Defect vs Improvement)

Pick the type before filing. The three types share one workflow (`.agents/jira-workflows.json`) but mean different things, and a wrong type corrupts the metrics built on them (defect-escape rate, pre-release containment, enhancement backlog).

### The decision rule (binding)

```
Q1. Does the behavior violate an acceptance criterion, explicit OR implied
    (a reasonable-quality expectation a correct system must meet)?
Q2. Is the affected feature ALREADY live in a superior environment
    (production / anything above Staging, visible to the end user)?
```

| Q1: violates an AC? | Q2: feature live above Staging? | Type |
|---|---|---|
| Yes | Yes, an end user can hit it | **Bug** |
| Yes | No, Staging or below, still pre-release | **Defect** |
| No, works as designed; no AC required it; it is an enhancement | n/a | **Improvement** |

### What decides Bug vs Defect

> Classification follows the **lifecycle stage of the FEATURE**, not the
> environment where you happened to find the problem.

A failure reproduced on `localhost` or in `qa` in a feature only just merged to lower environments is a Defect of a recently implemented story, wherever you observed it. A failure in a feature already live in production is a Bug even if you first saw it in Staging.

- A Bug escaped the sprint quality gate: every released feature is presumed to have passed it.
- A Defect is found before the feature crosses Staging. It is the normal output of sprint testing, contained and not escaped.
- An Improvement is not a broken criterion. The system behaves as designed, but a test beyond the AC (`test-design-doctrine.md`, Principle 2: ACs are the floor, not the ceiling) reveals a desirable change, or the AC was never specified correctly. It can be functional or non-functional. It is proposed work, handled like a story but carrying the defect-report schema and workflow.

### Cross-story exploration

You are testing Story A and trip over a failure that belongs to Story B. Check B's lifecycle stage. If B is in the same sprint or still pre-release, file a Defect against B and link B as the source. If B's feature is already in production, file a Bug.

### The Improvement bridge

When a test beyond the AC exposes a gap because the AC was under-specified or absent, the right artifact is an Improvement: the system did not violate a criterion that was ever defined. The usual signature is `root_cause = requirement_error` or `working_as_designed`. The Improvement proposes the missing behavior and, where useful, that the source Story's AC set be extended. Widening the Story's ACs quietly after the fact loses the proposal, so file the Improvement and let it be tracked.

### Reclassification safety net

Something filed as Bug or Defect that turns out to be an enhancement moves with the `is_not_a_bug` transition (to `enhancement`) or is re-filed as an Improvement. A genuine working-as-designed report closes through `is_wad` (to `rejected`). These transitions are a fallback; classify correctly up front.

---

## Part 2: QA Assignee (the quality owner of the issue)

`qa_assignee` (`{{jira.qa_assignee}}`, a single User Picker) records which QA followed an issue and answers for it. It differs from `reporter`, because the person who raised an issue is often not the one who retests it. It also differs from the native `assignee`, which follows the dev model: it names the current holder and moves to the QA when the Story reaches Ready For QA. The record survives every later reassignment.

### Scope

It is set on all work-type issues: `story`, `tech_story`, `tech_debt`, `bug`, `defect`, `improvement`. Xray container issues and Test cases do not carry it; they route through the Test Repository epic (Part 4).

### When to set it (binding)

- During Shift-Left, the first QA pickup of a Story (the refinement pass) sets `qa_assignee` to that QA. It stays for the Story's whole life, and the dev reads it to know whom to assign when the Story is deployed (Ready For QA).
- On first pickup to test, only if still empty: a Story (or tech-story, tech-debt) that reached testing without a Shift-Left pass gets `qa_assignee` set to the QA taking it, at `start_testing`.
- On filing any Bug, Defect or Improvement, set it to the QA who files (the same authenticated identity creating the report).

### Who is "the QA" (binding)

> The QA Assignee is the **authenticated user of the CLI / MCP session** doing
> the work: you assign *yourself*. There is no identity variable to configure.
> It is whoever's Atlassian account the tool is authenticated as, exactly as that
> account becomes the `reporter` of anything it creates.

### Never-overwrite (binding)

If `qa_assignee` is already set to another person, leave it. Each issue has its own QA owner, and overwriting it destroys accountability and metrics.

- Replace an existing QA Assignee only when the user explicitly instructs it with a reason (for example, the assigned QA cannot run the test and hands the issue over). Record the handover rationale.
- Mechanically this is read-before-write (Part 6): read the current value, and write only if it is empty or on an explicit, justified override.

### Native `assignee` follows the dev model (binding)

When a Story reaches Ready For QA, the dev moves the native `assignee` to the QA named in `qa_assignee`. Workflow transitions that put the QA in `assignee` (`start_testing`, `qa_sign_off`) are therefore expected, and the harness does not restore a previous owner after them.

1. `assignee` changing is no reason to overwrite `qa_assignee`. The record answers "who followed this Story", the native field answers "who holds it now".
2. A Story in testing whose native `assignee` is still someone else is not fixed silently. Note it in the report and ask before reassigning.
3. A mismatch is never solved by leaving `qa_assignee` empty.

---

## Part 3: Components (the affected product area)

`components` is a native Jira field, set directly and not through `{{jira.*}}`. It is mandatory on every Bug, Defect and Improvement and on every `Test`, and it is the primary grouping axis for quality metrics, JQL filters and dashboards.

- **Convention (binding): one component is one functional module of the application.** Components mirror the app's real surface (routes, features, bounded areas of the source: `/checkout/cart` becomes `Cart`, `/auth/login` becomes `Login`), not the planning taxonomy. They are deliberately finer than product Epics: an Epic is a unit of work, a component is a unit of the running system, and a filter is only as useful as it is discriminating. Set the component to the area the issue or test touches.
- **A component may be declared ahead of the code.** A feature under refinement has Stories, ACs and often Tests before it has a route, and all of them need somewhere to hang. Declare the component when the module becomes a known part of the product, and treat the source as evidence of what exists, not as the gate. The reconciler is re-run as the map evolves, `create` is additive, and `rename` re-labels a component without touching issue assignments, so a forward-declared component costs nothing if the feature ships under another name or never ships.
- **Components must pre-exist.** Jira rejects names the project's Components admin module does not define. `acli` cannot create or edit them (`acli/SKILL.md` §Hard limits), so populating them is an admin task or a REST operation, driven by `scripts/sync-jira-components.ts` through `jira-administration` mode `components`. That flow is plan-based on purpose: the AI proposes the module map, a human approves it, and only the approved plan is written. Renaming (which preserves issue assignments) is separate from creating.
- **The module map comes from two inputs:** the app's source (what exists) and the backlog's Epics and Stories (what is coming). Source alone drops every planned module, and that shows up later as an issue nobody can classify.
- **Prefix components with the product name when the product's domain vocabulary overlaps QA's** (a conditional recommendation, not a blanket rule). A test-management product has features named Tests, Runs and Bugs, so a component called `Tests` is ambiguous between the product feature and the QA artifacts about it. `Bunkai Tests` and `Bunkai Runs` remove the doubt. An e-commerce site has no such overlap, and there the prefix is noise. When the AI detects the overlap while proposing a component plan, it raises it with the user and does not apply the prefix silently.
- **Multiple components are allowed** when an issue genuinely spans areas; otherwise prefer the single most-affected module. On a `Test` they are metadata that travels in the synced `.md`, and placement on disk follows the covering Story, so a Test spanning two modules costs nothing.
- Components answer "what part of the product broke". That is a different axis from `parent` ("which QA bucket tracks it", Part 4), so keep them apart.

---

## Part 4: QA process epics & the three-axis model

Bugs, Defects, Improvements and Test cases are QA process artifacts, not product backlog. Parenting them to a product or development Epic pollutes story-level roadmap and burndown metrics. They hang from a dedicated QA process epic instead, and the other two axes carry their product area and source.

### The three axes

```
parent / Epic Link  ->  QA PROCESS EPIC      ("which QA bucket tracks this")
issue link          ->  SOURCE story/feature ("what this came from", traceability)
components          ->  PRODUCT module/epic  ("what part of the product it affects")
```

- `parent` is the QA process epic (below), never a product or dev epic.
- The issue link points to the originating Story or feature through the causal or coverage link: `problem_incident` (*causes* / *is caused by*), `blocks` when it gates a release, `test` for container-to-Story coverage. The per-Story **ATS**-to-Story link is the coverage-bearing edge (live-verified); ATP-to-Story and ATR-to-Story are administrative; a direct TC-to-Story link is the cascade's last resort (`traceability-linking.md` §3). Traceability lives here, not in the parent.
- `components` is the affected product area (Part 3).

### The four QA process epics

| Epic | Holds | Project-configured name |
|---|---|---|
| **Master Test Plan epic** | every **Test Plan** (FTP/STP/ATP/RTP) | `qa.qa_epics.master_test_plan_epic.name`, "QA Master Test Plan" |
| **Test Repository epic** | every **Test** (TC) | `qa.qa_epics.test_repository_epic.name`, "QA Test Repository" |
| **Test Artifacts epic** | every **Test Execution** (STR/ATR/RTR), **Precondition**, and **Test Set**: both the per-Story **ATS** (`ATS: {US_ID}: {story title}`, mandatory per Story, components INHERITED from the Story) and the optional feature-level **`TS:`** (`TS: {EPIC\|module}: Validate {feature}`, components optional, may cross modules) | `qa.qa_epics.test_artifacts_epic.name`, "QA Test Artifacts" |
| **Defect epic** | every **bug/defect/improvement** | `qa.qa_epics.defect_epic.name`, "QA Defect Management" |

- The Master Test Plan epic is an Epic (not a Test Plan work type) and the parent of all Test Plans (FTP/STP/ATP/RTP). Its description carries the Master Test Plan itself as the source of truth, cached by the sync at `.context/PBI/qa-artifacts/master-test-plan.md`, plus a pointer to the official QA team repository. It is cross-linked (`relates to`) to its three sibling QA epics (`planning-ladder.md` §1.1).
- Test Sets split by altitude. The per-Story ATS is mandatory, one per Story even for a single Test, and inherits its components from the Story (like ATP and ATR). Only the optional feature-level `TS: {EPIC|module}: Validate {feature}` set is exempt from components, since it may cross modules (smoke, regression, feature grouping). Both parent to the Test Artifacts epic, and the ATS also carries the coverage-bearing `test` link to its Story (`traceability-linking.md` §3).
- Epic identity (name and key) is configured per project in `.agents/project.yaml` under `qa.qa_epics:`. Skill content never hardcodes it. Resolve by the configured name; the resolver finds or creates the epic and caches the key.

#### Every QA process epic carries the `{{QA_ARTIFACT_LABEL}}` label (binding)

Apply it at creation time, on all four. It tells tooling that an Epic is a QA bucket and not a product module: `scripts/sync-jira-issues.ts` reads it to keep these Epics out of `.context/PBI/epics/` (the product tree) and to index them under `qa-artifacts/` instead. Without the label they land beside real product Epics as near-empty folders, because a Story query against a process epic returns nothing.

The label is the primary signal because the other two are weaker: the cached `qa.qa_epics.*.key` values are `null` until a skill discovers them, and the `QA ` name prefix misfires on a product Epic legitimately named "QA Tooling". The sync falls back to the prefix and reports it, so a run that mentions the fallback is asking for this label.

```
[ISSUE_TRACKER_TOOL] Create Issue:
  type: Epic
  summary: {{jira.qa_epics.<slug>.name}}
  labels: [{{QA_ARTIFACT_LABEL}}]
```

Adding the label to an existing Epic is a one-field edit, worth doing the first time a sync reports the fallback.

### Find-or-create (binding setup behavior)

Before filing a Bug, Defect, Improvement or Test, resolve the relevant process epic by its configured name:

1. **Exists:** parent the new issue to it and cache its key into `.agents/project.yaml` `qa.qa_epics.<epic>.key` when that leaf is still `null` or holds a stale key. Discovery without cache-back is the measured failure (ADR-0006): all four Epics existed in Jira while every `key` was `null`, so each session re-discovered them or read the `null` as "absent" and proposed duplicates. Leaving the leaf `null` after a successful lookup is a defect.
2. **Absent:** create it once as the project's QA process epic, write the project's defect-management (or test-repository) strategy summary into the epic description, record its key into `.agents/project.yaml` `qa.qa_epics.<epic>.key`, then parent. This is a one-time bootstrap, not a per-issue action.

> The QA process epics are excluded from the Components module: they are
> process buckets, never selectable as a product component (Part 3).

---

## Part 5: Mandatory field matrix

A rich report is not optional polish. These fields are the defect-management metrics (JQL filters, dashboards, escape and containment rates), and a report that skips them is incomplete. This table is the per-work-type obligation and the only place it is stated. `.agents/jira-required.yaml` `required:` is a different thing: one catalog of which fields must exist on the instance and what each falls back to when absent. A field this table requires that the instance lacks follows its `fallback:` there, and stays required here.

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

A required field absent from the instance falls back to a structured comment per its `fallback:` in `.agents/jira-required.yaml`. A missing field never blocks the filing.

### Part 5.1: Severity to Priority (auto-derive, override allowed)

`priority` is set from `severity` by this matrix. The QA may override it with a one-line justification when business urgency diverges from technical severity (a `trivial` typo in the landing hero may warrant `High`).

| Severity (`{{jira.severity}}`, option slugs declared in `.agents/jira-required.yaml`) | Priority (native) |
|---|---|
| `{{jira.severity.critica}}` | Highest |
| `{{jira.severity.mayor}}` | High |
| `{{jira.severity.moderada}}` | Medium |
| `{{jira.severity.menor}}` | Low |
| `{{jira.severity.trivial}}` | Lowest |

---

## Part 6: Write mechanics (acli + REST, no bespoke tooling)

Filing uses the existing tooling; there is no special defect-management binary. Load `/acli` first: it owns the syntax, the auth and the REST-PUT pattern below.

- **Create** the issue with acli `workitem create --from-json`. Pass create-time custom fields under `additionalAttributes.{customfield_NNNNN}` (reference each by its `{{jira.<slug>}}` token, such as `{{jira.qa_assignee}}`) and the native `components: [{ "name": "<pre-existing>" }]` array. Round-trip-validate the components key on first use.
- **acli `workitem edit` cannot set custom fields or `components`** (exit 1). To set or change either on an existing issue, use REST `PUT /rest/api/3/issue/{KEY}` with `{ "fields": { … } }`. The pattern and the `--out/--in` link-inversion gotcha live in the /acli skill's `references/acli-integration.md`.
- **Never-overwrite (Part 2) is read-before-write.** Read the issue's current `qa_assignee` (from the synced `.md` or a GET) before setting it, and write only when it is empty or on an explicit, justified handover.
- **Find-or-create the QA process epic** (Part 4) with acli: JQL-search by the configured `qa.qa_epics.*.name`, and if absent, `workitem create --type Epic`.

---

## Part 7: Where this fires (per skill)

- `/sprint-testing` is the primary filer. It sets `qa_assignee` when a Story is taken into testing (Stage 1) and the Shift-Left pass left it empty, classifies and files Bug, Defect and Improvement with the full matrix in Stage 3, parents to the Defect epic and links to the source Story.
- `/regression-testing` classifies a regression failure and files it in Jira (Bug if the feature is live above Staging, Defect if pre-release) with the full matrix, not as a GitHub issue.
- `/test-automation`, on exposing a real product issue, classifies it, delegates the filing (carrying the classification and fields) and records the key.
- `/test-documentation` files no Bugs. It parents every `Test` it creates to the Test Repository epic (Part 4), sets `components`, and may raise an Improvement when a test beyond the AC reveals an under-specified AC (Part 1).

---

## Part 8: Anti-patterns (the drift this doctrine stops)

```
[x] Bug/Defect/Improvement parented to a product/dev Epic     -> QA process epic (Part 4)
[x] Empty components on a quality report                       -> mandatory (Part 3)
[x] Overwriting an existing QA Assignee silently              -> never-overwrite (Part 2)
[x] Typing Bug vs Defect by when/where it was found, not by the feature's
    lifecycle stage                                            -> Part 1
[x] Widening a Story's ACs silently after a test finds a gap  -> file an Improvement
[x] Reporting "% of ACs verified" as completeness            -> see test-design-doctrine.md
```

---

## Part 9: Filing gate (the checklist)

Run before submitting any Bug, Defect or Improvement. A report that cannot answer YES (or a justified N/A) to each item is not done.

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

---

## With nobody at the keyboard

The general rule is in `decision-protocol.md`. Where this doctrine waits for a person:

- **Native `assignee` is still someone else on a Story in testing (Part 2):** a present person is asked before any reassignment. A supervised worker asks its conductor. A routine leaves it and notes the mismatch in the report.
- **Replacing an existing `qa_assignee` (Part 2):** needs an explicit instruction with a reason, from the user or from the conductor. A routine changes it only when the delegating brief names the handover.
- **Component plan and product-name prefix (Part 3):** a person approves the map and the prefix, and a conductor does for a worker. A routine writes the proposed plan to its report and applies nothing.
