---
name: test-documentation
description: "Analyze, prioritize, and document test cases in TMS (Jira/Xray) -- the bridge between manual QA and test automation. Use when creating Test/ATP/ATR artifacts, calculating ROI to choose which tests to automate, maintaining US-ATP-ATR-TC traceability, or repairing broken TMS links. Supports four scopes: module-driven (exhaustive module exploration), ticket-driven (QA-approved user story), bug-driven (regression TC for a closed bug), and ad-hoc/exploratory. Produces three outcomes per TC: Candidate (feeds test-automation), Manual (terminal), Deferred (terminal). Triggers on: document tests, create test cases in Jira/Xray, prioritize for automation, ROI analysis, which tests to automate, Candidate vs Manual, link ATP to ATR, fix TMS traceability, stage 4, turn this bug into a regression test. Do NOT use for writing test code (test-automation) or running suites (regression-testing)."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
---

# Test Documentation — QA Bridge

Take already-validated tests and formalize them in the TMS (Jira, Xray, or equivalent) with full traceability, the right priority, and a clear automation verdict.

Three phases, always in this order: **Analyze -> Prioritize (ROI) -> Document**. Never skip prioritization: most scenarios should end up Deferred, not automated.

One hard prerequisite: the tests being documented must describe behavior that was **already validated** ({{jira.status.story.qa_approved}} story, closed bug, or finished exploratory session). The TMS is a documentation and regression-protection tool, not an exploration tool.

---

## Subagent Dispatch Strategy

This skill is compliant with the doctrine in `AGENTS.md` §"Orchestration Mode (Subagent Strategy)". Every dispatch follows the 6-component briefing format defined in `.claude/skills/framework-core/references/briefing-template.md`, and the pattern selected per phase matches the decision guide in `.claude/skills/framework-core/references/dispatch-patterns.md`. Phase 1 (Analyze) and Phase 2 (Prioritize) stay inline because planning and decisions live in the orchestrator; the only Parallel hotspot is bulk TC creation in Phase 3, which is also the only step that branches per TMS modality.

| Phase                                                  | Pattern    | Subagent role                                                                                                                                              |
|--------------------------------------------------------|------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Phase 1 — Analyze scope                                | Single     | inline — planning lives in the orchestrator (anti-pattern to delegate)                                                                                      |
| Phase 2 — ROI / Candidate-Manual-Deferred verdict      | Single     | inline — decisions live in the orchestrator                                                                                                                 |
| Phase 3 — TMS TC creation (N > 10 TCs)                 | Parallel   | M subagents, chunks of ~5-10 TCs per agent; cap = 10 to avoid Jira/Xray rate limits; each subagent loads `/xray-cli` (Modality A) or `/acli` (Modality B)  |
| Phase 3 — TMS TC creation (N ≤ 10 TCs)                 | Single     | inline — dispatch overhead is not justified for small batches                                                                                               |
| Phase 3 — Traceability linking (US <-> ATP <-> ATR <-> TCs) | Single     | inline — requires aggregated state of all created entities                                                                                                  |
| Phase 3 — Final report / coverage matrix               | Single     | inline — synthesis lives in the orchestrator                                                                                                                |

- **Concurrency cap = 10 subagents** for Parallel TC creation. Jira and Xray APIs both rate-limit at ~10 writes/sec sustained; fanning out wider triggers 429 responses. If a module has >100 TCs, batches per subagent must be larger than 10 each (cap is on subagent count, not chunk size).
- **Error protocol**: On any subagent failure: STOP, report the partial success state (which TCs landed, which failed, with their issue keys / errors), present retry / skip / abort options. Do NOT auto-fix nor auto-rollback. See `.claude/skills/framework-core/references/orchestration-doctrine.md`.

---

## Phase 0 — Resolve TMS modality (mandatory gate)

Every project runs in one of two modalities. Resolve it **before** Phase 1. The same ATP/ATR/TC concepts have **different containers** in each mode.

### The question you MUST answer first

```
Does this project have Xray installed and licensed on Jira?
  A. Yes -> Modality A: Xray on Jira
  B. No  -> Modality B: Jira-native (no Xray)
```

### How to resolve it without asking (in order)

1. Check `CLAUDE.md` for `{{TMS_CLI}}`. Value `bun xray` (or any Xray CLI) -> **Modality A**. Value is unset, `acli`-only, or `{{TMS_CLI}}` matches `{{ISSUE_TRACKER_CLI}}` -> **Modality B**.
2. If `CLAUDE.md` is ambiguous, look for a `.context/master-test-plan.md` line such as `TMS: Xray on Jira` or `TMS: Jira native`.
3. If still ambiguous, list existing issue types in the project via `[ISSUE_TRACKER_TOOL] List issue types`. If the project exposes `Test Plan` / `Test Execution` / `Test Set` / `Pre-Condition`, it is **Modality A**. Otherwise **Modality B**.
4. **Only if all three checks fail**, ask the user the question above. Do NOT ask by default — autoresolve first.

### What changes per modality

| Artifact | Modality A (Xray on Jira) | Modality B (Jira-native) |
|----------|---------------------------|---------------------------|
| **ATP** (Acceptance Test Plan) | Xray `Test Plan` issue, named `Test Plan: {{PROJECT_KEY}}-{n}`, linked to US | Story `{{jira.acceptance_test_plan_atp}}` + comment mirror on the Story. No separate issue. |
| **ATR** (Acceptance Test Results) | Xray `Test Execution` issue with Test Runs per TC, Environment, Begin/End Date, named `Test Results: {{PROJECT_KEY}}-{n}` | Story `{{jira.acceptance_test_results_atr}}` + comment mirror on the Story. |
| **TC** (Test Case) | Xray `Test` issue (type Manual / Cucumber / Generic) | Jira-native `Test` issue type (or `Task` with custom type), Description carries the full TC template |
| **Test Set / Precondition / Test Plan** | First-class Xray issue types | Not available — use labels + Epic grouping |
| **Result sync** | CI imports JUnit/Cucumber via `[TMS_TOOL] Import Results` -> Test Runs auto-update | Custom script updates Test Status field on each TC + comment with build context |
| **CLI tag** | `[TMS_TOOL]` resolves to `bun xray` or equivalent | `[TMS_TOOL]` falls through to `[ISSUE_TRACKER_TOOL]` (acli / Jira MCP) |

### Persist the decision

Once resolved, save the modality into `test-session-memory.md` for the ticket (if one exists) and treat it as sticky: do not re-resolve mid-session. If you detect drift (e.g. `[TMS_TOOL]` suddenly fails), stop and ask the user before re-resolving.

Reference implementations:
- Modality A concepts + Xray REST/GraphQL/CLI -> `references/xray-platform.md`
- Modality B project setup (Test issue type, Screen Scheme, custom fields) -> `references/jira-setup.md`
- Both modes side-by-side (field mapping, workflow, Description template) -> `references/jira-test-management.md`

---

## When to use each scope

Pick the scope based on the input, not the output. All four scopes share the same Analyze -> Prioritize -> Document pipeline; only the input source and defaults differ.

| Scope | Input | Typical volume | Default labels | Notes |
|-------|-------|----------------|----------------|-------|
| **Module-driven** | A module of the system explored end-to-end | 20-100+ scenarios | `regression`, `e2e` or `integration` | Batch of TCs grouped under the Regression Epic. Most scenarios will be Deferred. |
| **Ticket-driven** | A QA Approved user story from a sprint | 3-8 scenarios | `regression`, plus the test type | Output of a `sprint-testing` session. ATP/ATR created per US. |
| **Bug-driven** | A closed bug with a verified fix | 1-2 scenarios | `regression`, `automation-candidate` (usually) | One regression TC per bug. ROI is biased up: "it failed once, it can fail again." |
| **Ad-hoc / Exploratory** | New scenarios found in exploratory testing | 1-10 scenarios | `regression` | Apply the 3 Phase-0 questions harshly; ad-hoc scenarios are often one-time validations. |

If the user gives you a story ID, use ticket-driven. If they give you a bug ID, use bug-driven. If they give you a module name or a session output, use module- or ad-hoc accordingly.

---

## Phase 1 — Analyze

### Inputs you must gather

| Source | What to read | Why |
|--------|--------------|-----|
| User Story / Epic | Description, ACs, comments, linked issues | Scenario identification, risk signals |
| Closed bugs linked to the story | Summary, root cause, fix area | Prior-bug prioritization rule |
| Exploratory session notes | Validated scenarios, observations | Reuse nomenclature already used |
| Existing ATP (if present) | `.context/PBI/.../acceptance-test-plan.md` or TMS ATP | Scenarios may already exist — do not reinvent |
| Implementation plan / source code | Actual files, APIs, test IDs | Validate design matches implementation before documenting |

### Separate real scenarios from cross-cutting characteristics

Cross-cutting traits are **validated inside every test**, not as separate TCs.

| Cross-cutting (NOT a TC) | Validated by |
|--------------------------|--------------|
| Mobile responsive | Running each test in mobile viewport |
| XSS prevention | Using special-character test data inside tests |
| Performance | Timing assertions inside tests |
| Accessibility | A11y assertions inside UI tests |
| API contract | Response schema checks inside API tests |
| Generic "error handling" | Specific negative-path scenarios |

A real scenario is a **user flow**: clear business objective, concrete precondition + action, verifiable outcome. Name format: `Validate <CORE> <CONDITIONAL>`.

### Source-code validation (mandatory before documenting)

The design in the ATP was written before code existed. Before creating any TC:

1. Open the implementation plan (if any) and list the files it touches.
2. Grep the actual code for `data-testid=`, route handlers, API paths, and text formats.
3. Compare the ATP's assumptions against what the code does. If they diverge, correct the TC design and add a Refinement Notes section.

Common discrepancies to check for:
- An API the ATP assumed exists turns out to be SSR/direct DB.
- UI text format in the ATP ("based on N reviews") vs reality ("(N reviews)").
- Hardcoded IDs in the ATP vs variable pattern required in TMS.

Skipping this step is the single most common cause of invalid automated tests later.

### TC identity rule (load-bearing)

**A TC is defined by Precondition + Action**. All expected results from the same (precondition, action) pair belong to the **same TC**, not separate TCs.

```
Same TC:                                    Different TCs:
  Precondition: valid credentials             Precondition: valid credentials     -> TC-A
  Action:       submit login                  Precondition: locked account        -> TC-B
  Assertions:   redirect + token + welcome    Precondition: invalid credentials   -> TC-C
                (all one TC)                  (all same action, but preconditions differ)
```

Splitting one (precondition, action) into N "check panel A / check panel B / check panel C" TCs is a textbook anti-pattern. One TC, multiple assertions.

### Equivalence Partitioning

Inputs that produce the **same output** -> one parameterized TC (Scenario Outline + Examples). Inputs that produce **different outputs** -> separate TCs.

---

## Phase 2 — Prioritize (ROI)

Every scenario passes three gates in order. Fail any gate -> Deferred.

### Phase 0: The three filter questions

1. **Does it protect against FUTURE regressions?** If the bug was a one-time typo in a stable area, the answer is no. Defer.
2. **Are there PRIOR bugs in this area?** Yes -> prioritize even with moderate ROI ("it failed once, it can fail again").
3. **Is it an APP-level concern or a FEATURE-level concern?** XSS / a11y / performance / responsive are APP-level suites, not per-feature TCs. Defer from this scope.

### ROI formula (load-bearing)

```
ROI = (Frequency x Impact x Stability) / (Effort x Dependencies)
```

Each factor is scored 1-5 independently:

| Factor | 1 | 2 | 3 | 4 | 5 |
|--------|---|---|---|---|---|
| Frequency (how often run) | Yearly / rarely | Every release | Every sprint | Daily | Every PR / commit |
| Impact (if it fails) | Cosmetic | Minor inconvenience | Degrades UX | Blocks feature | Revenue / core business |
| Stability (of the flow) | Very volatile | Unstable | Moderate | Stable, minor changes | Unchanged for months |
| Effort (to automate) | Trivial | Low (hours) | Moderate (1-2 days) | High (several days) | Very high (week+) |
| Dependencies | None | 1-2 simple | 3-4 | 5+ | Complex externals |

Note: Effort and Dependencies are **divisors** — higher score = worse. The other three are multipliers.

### Component value bonus

If a TC is reusable across multiple E2E flows:

```
Component Value = Base ROI x (1 + 0.2 x N)
```

where `N` = number of E2E flows that consume it. A low-ROI atomic like `authenticateSuccessfully` can become automate-worthy purely through reuse.

### Three outcomes (load-bearing)

Every scenario ends in exactly one of these buckets. There is no fourth.

| Outcome | Triggers it | Where it goes next | TMS status flow |
|---------|------------|--------------------|------------------|
| **Candidate** | ROI > 3.0, OR (ROI 1.5-3.0 AND prior bug), OR critical happy path | Feeds `test-automation` skill | Draft -> In Design -> Ready -> In Review -> Candidate |
| **Manual** | ROI 0.5-1.5 AND not automatable (human judgment, visual inspection), OR explicitly manual-only | Terminal: manual regression suite | Draft -> In Design -> Ready -> Manual |
| **Deferred** | ROI < 0.5, OR failed Phase-0 filter, OR one-time validation | Terminal: not in regression. Can be revisited if system changes | Do not create TC in TMS; document as Deferred in the prioritization report |

**Rule of thumb**: if more than 50% of candidates end up Candidate or Manual, re-apply Phase 0 more strictly. Most scenarios should be Deferred.

---

## Phase 3 — Document in TMS

### Preflight: Regression Epic

Every documented TC must have a parent Regression Epic (single test repository for the project).

> **Prerequisite**: Load `/acli` skill before executing commands below.

```
[ISSUE_TRACKER_TOOL] Search Issues:
  project: {{PROJECT_KEY}}
  query: type = Epic AND (summary ~ "regression" OR summary ~ "test repository" OR labels = "test-repository")
```

If none exists, ask the user before creating one with name `{{PROJECT_KEY}} Test Repository` and labels `test-repository, regression`.

### Entity model: ATP / ATR / TC

Four entities, always linked US <-> ATP <-> ATR <-> TC:

| Entity | Created | Naming | Main content |
|--------|---------|--------|--------------|
| **US** (Story) | Pre-existing | `{{PROJECT_KEY}}-{n}` | The requirement |
| **ATP** | Stage 1 (or now, if missing) | `Test Plan: {{PROJECT_KEY}}-{n}` | Test Analysis + AC-to-TC coverage |
| **ATR** | Stage 1 (or now, if missing) | `Test Results: {{PROJECT_KEY}}-{n}` | Test Report + execution results |
| **TC** | Stage 4 (this phase) | `{US_ID}: TC#: Validate <CORE> <CONDITIONAL>` | Precondition + Action + Expected |

Read `references/tms-architecture.md` when creating ATP/ATR/TC for a ticket, checking required links, or validating that a story is fully documented.

### Linking order (always)

```
1. Create ATP -> link to US
2. Create ATR -> link to US
3. Update ATP -> link to ATR (bidirectional plan/results)
4. For each TC:
     Create TC -> link to US + ATP + ATR + AC
```

Creating a TC before the ATP and ATR exist leaves orphaned references. Fix any broken links with `references/tms-architecture.md` §Traceability Rules.

### Creating TCs — modality matrix

| TMS stack | Manual test | Automation-candidate test |
|-----------|-------------|---------------------------|
| **Xray on Jira** | `[TMS_TOOL] Create Test: type=Manual, steps=...` then `[ISSUE_TRACKER_TOOL] Update Issue` to paste the complete Description template | `[TMS_TOOL] Create Test: type=Cucumber, gherkin=<high-quality gherkin>` then `[ISSUE_TRACKER_TOOL] Update Issue` with the Description template |
| **Native Jira (no Xray)** | `[ISSUE_TRACKER_TOOL] Create Issue: issueType=Test, description=<steps table>` | `[ISSUE_TRACKER_TOOL] Create Issue: issueType=Test, description=<gherkin in Description>` |

Always populate Description with the full TC template (Related Story, Priority, ROI, Prior bugs, Test Design gherkin/steps, Variables table, Implementation Code table, Architecture, Available Test IDs, Preconditions, Expected Results). Read `references/jira-test-management.md` when choosing between Xray and native Jira, or when the Description must be filled.

> **Dispatch**: Use the dispatch defined in §Subagent Dispatch Strategy: **Parallel** when N > 10 TCs (cap = 10 subagents), inline otherwise. The full briefings for both Modality A (Xray via `/xray-cli`) and Modality B (Jira-native via `/acli`) live in `references/tms-architecture.md` §"Parallel TC creation". The sharding rule, error protocol, and aggregation contract are documented there. The serial flow below is the canonical procedure each subagent runs internally for its assigned chunk.

### High-quality Gherkin (for Candidates)

```gherkin
@{priority} @regression @automation-candidate @{US_ID}
Scenario Outline: Validate <core> <conditional>
  """
  Bugs covered: BUG-1, BUG-2
  Related Story: {US_ID}
  """

  # === PRECONDITIONS (tester / script builds them) ===
  Given <entity> exists with <identifier>
  And <entity> has <quantity> <elements> where <quantity> <condition>

  # === ACTION ===
  When the user navigates to "<route>"
  And the user <main_action>

  # === VALIDATIONS ===
  Then <ui_element> is displayed with format "<expected_format>"
  And <additional_validation>

  # === EQUIVALENT PARTITIONS ===
  Examples: Happy path
    | ... |
  Examples: Edge case
    | ... |
```

Rules that always apply:
- **Variables, never hardcoded data**: `{mentor_id}` not `550e8400-...`. Include a Variables table with how to obtain each.
- **Tags always include**: priority (`@critical|@high|@medium|@low`), suite (`@regression`, `@smoke` if critical path), automation flag (`@automation-candidate`), traceability (`@{US_ID}`).
- **Structured comments**: `# === PRECONDITIONS ===`, `# === ACTION ===`, `# === VALIDATIONS ===`, `# === EQUIVALENT PARTITIONS ===`.
- **Docstring with metadata**: related story, bugs covered, ROI.

### Workflow transitions

```
Draft --start design--> In Design --ready to run--> Ready --+-- for manual        --> Manual    (terminal manual)
                                                            +-- automation review --> In Review
                                                                                       |
                                                                                       +-- approve to automate --> Candidate (feeds test-automation)
```

Never jump states. If a TC needs rework, use the "back" transition to In Design.

### Naming — the one rule that matters

```
{US_ID or TS_ID}: TC#: Validate <CORE> <CONDITIONAL>
```

- `CORE`: verb + object — the behavior itself (`successful login`, `authentication error`, `order creation`).
- `CONDITIONAL`: the distinguishing condition (`with valid credentials`, `when password is incorrect`, `when exceeding 5 failed attempts`).
- In code (KATA): `@atc('{US_ID}-TC#')` decorator and `Should <behavior> when <condition>` in `test()` blocks.

Anti-patterns to reject: `"Login test"`, `"Login - error"`, `"TC1: Test form"`.

### Labels — baseline per TC

Every TC gets at least one scope label and one status label:

- Scope (required, one+): `regression` (almost always), `smoke` (critical path only — aim for 10-20% of suite), `e2e`, `integration`, `functional`.
- Status (applied as it moves): `automation-candidate`, `manual-only`, `automated`. `automation-candidate` and `manual-only` are mutually exclusive; remove `automation-candidate` once it becomes `automated`.
- Priority (optional): `critical`, `high`, `medium`, `low`.

Full reference in `references/tms-conventions.md` §Labels.

### Local cache (Claude Code convention)

After TMS creation, write one markdown file per TC into `.context/PBI/{module}/{story}/tests/{TC-ID}-{slug}.md`. Template in `references/jira-test-management.md` §Local cache. This prevents re-reading the TMS in future sessions and gives `test-automation` an immediate handoff.

---

## Gotchas

- **ROI divisors matter**: Effort and Dependencies go in the denominator. A "critical flow" with Effort=5 and Dependencies=5 has low ROI by design — that is correct, not a bug in the formula.
- **Prior-bug rule overrides ROI thresholds**: a scenario tied to a closed bug enters regression even at ROI 1.5-3.0. Source: `test-prioritization.md` + `atc-definition-strategy.md` — both agree.
- **Cross-cutting is not a TC**: "Mobile responsive", "XSS prevention", "Performance" are never TCs on their own. They are validated inside other TCs or in an app-level suite.
- **Linking order is not optional**: create ATP and ATR BEFORE the first TC. If you create TCs first, you get orphaned references and `fix-traceability` is the only way out.
- **Xray requires two calls**: one `[TMS_TOOL] Create Test` (registers in Xray), then one `[ISSUE_TRACKER_TOOL] Update Issue` to paste the full Description. Skipping the second call leaves a TC with no readable documentation in Jira.
- **Never hardcode UUIDs or emails** in Gherkin. Always use `{variable}` with a Variables table and a query showing how to obtain the real value at runtime.
- **One (precondition, action) = one TC**. Multiple expected results all belong to the same TC. Splitting assertions into separate TCs is the single most-diagnosed anti-pattern in reviews.
- **Bug-driven TCs default to Candidate**. A closed bug is empirical evidence that the area regresses. Start at "automate" unless automation is technically impossible.
- **Source-code validation is mandatory**: the ATP was written before code. Grep for `data-testid=`, routes, text formats. Log discrepancies in a Refinement Notes section on the TC.
- **Most candidates should be Deferred**. If a module produces 80 scenarios and 60 end up in regression, re-apply Phase 0 more harshly. Target: a few well-chosen TCs per story (1-3 simple, 3-5 complex).
- **Test Plan / Test Set ID (Xray) vs User Story ID (native Jira)**: the TC prefix depends on stack. In Xray with a Test Set, prefix is the TS ID. In native Jira, prefix is the US ID. Both work — pick one per project and stay consistent.

---

## Specific tasks

- **Creating ATP/ATR/TC for a story or checking links** -> read `references/tms-architecture.md` (entity model, required fields, linking sequence, completeness criteria).
- **Naming a TC, filling fields, picking labels, or choosing Gherkin vs Traditional** -> read `references/tms-conventions.md` (naming formulas, label taxonomy, workflow state machine, ROI table).
- **Working in Jira native or Jira+Xray mode, creating tests via the right tool, or producing the full Description template** -> read `references/jira-test-management.md` (mode comparison, Xray issue types, Description template, local cache template, CI/CD sync).
- **Fixing broken traceability (TC not linked to US/ATP/ATR, name wrong)** -> use the procedure in the Linking Order section above, backed by `references/tms-architecture.md` §Traceability Rules.
- **Deciding if a bug deserves a regression TC** -> apply Phase 0 question 2 (prior bug = prioritize), then ROI; bug-driven scope defaults to Candidate.
- **TMS operations** -> load `/xray-cli` skill for concrete CLI syntax. Issue-tracker operations resolve via `[ISSUE_TRACKER_TOOL]` per CLAUDE.md Tool Resolution.

---

## Quick reference — pseudocode per modality

Resolve `[TMS_TOOL]` / `[ISSUE_TRACKER_TOOL]` via `CLAUDE.md` §Tool Resolution. The shape of the calls differs by modality — the two blocks below are parallel, pick one based on Phase 0.

### Regression epic (both modalities, run once per project)

> **Prerequisite**: Load `/acli` skill before executing commands below.

```
[ISSUE_TRACKER_TOOL] Search Issues:
  project: {{PROJECT_KEY}}
  query: type = Epic AND labels = "test-repository"

# If none, ask the user before creating:
[ISSUE_TRACKER_TOOL] Create Issue:
  project: {{PROJECT_KEY}}
  issueType: Epic
  title: "{{PROJECT_KEY}} Test Repository"
  labels: test-repository, regression, qa
```

### Modality A — Xray on Jira

> **Prerequisite**: Load `/xray-cli` and `/acli` skills before executing commands below.

```
# ATP = Xray Test Plan issue
[TMS_TOOL] Create TestPlan:
  project: {{PROJECT_KEY}}
  title: Test Plan: {{PROJECT_KEY}}-{n}
  tests: []                       # filled as TCs are created

[ISSUE_TRACKER_TOOL] Link Issues:
  linkType: "tests"
  outward: {ATP_KEY}
  inward:  {STORY_KEY}

# ATR = Xray Test Execution issue
[TMS_TOOL] Create Execution:
  project: {{PROJECT_KEY}}
  title: Test Results: {{PROJECT_KEY}}-{n}
  testPlan: {ATP_KEY}
  environment: {from .env or session context}
  tests: []                       # filled at Stage 3 or via CI import

[ISSUE_TRACKER_TOOL] Link Issues:
  linkType: "is tested by"
  outward: {ATR_KEY}
  inward:  {STORY_KEY}

# TC = Xray Test issue (Cucumber for Candidates; Manual for Manual-only)
[TMS_TOOL] Create Test:
  project: {{PROJECT_KEY}}
  type: Cucumber
  title: {US_ID}: TC#: Validate <CORE> <CONDITIONAL>
  labels: regression, automation-candidate, e2e, critical
  gherkin: {from high-quality gherkin}

[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {TEST_KEY}
  description: {full Description template}

# Link TC to ATP, ATR, Story
[TMS_TOOL] AddTests:
  testPlan: {ATP_KEY}
  tests: [{TEST_KEY}]
[TMS_TOOL] AddTests:
  execution: {ATR_KEY}
  tests: [{TEST_KEY}]
[ISSUE_TRACKER_TOOL] Link Issues:
  linkType: "is tested by"
  outward: {TEST_KEY}
  inward:  {STORY_KEY}

# CI result flow (Stage 6)
[TMS_TOOL] Import Results:
  format: junit        # or cucumber, xray-json
  file:   ./test-results/junit.xml
  execution: {ATR_KEY}
```

### Modality B — Jira-native (no Xray)

> **Prerequisite**: Load `/acli` skill before executing commands below.

```
# ATP = Story customfield + comment mirror. NO separate issue.
[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {STORY_KEY}
  fields:
    {{jira.acceptance_test_plan_atp}}: {Test Analysis body}
  labels: +shift-left-reviewed

[ISSUE_TRACKER_TOOL] Add Comment:
  issue: {STORY_KEY}
  body: |
    === Acceptance Test Plan ({{PROJECT_KEY}}-{n}) ===
    {Test Analysis body — byte-for-byte mirror of {{jira.acceptance_test_plan_atp}}}

# ATR = Story customfield + comment mirror. NO separate issue.
[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {STORY_KEY}
  fields:
    {{jira.acceptance_test_results_atr}}: {Test Report body}

[ISSUE_TRACKER_TOOL] Add Comment:
  issue: {STORY_KEY}
  body: |
    === Acceptance Test Results ({{PROJECT_KEY}}-{n}) ===
    {Test Report body — byte-for-byte mirror of {{jira.acceptance_test_results_atr}}}

# TC = Jira-native Test issue (custom issue type configured per jira-setup.md)
[ISSUE_TRACKER_TOOL] Create Issue:
  project: {{PROJECT_KEY}}
  issueType: Test                               # or Task with a Test Type custom field
  summary: {US_ID}: TC#: Validate <CORE> <CONDITIONAL>
  priority: {Critical|High|Medium|Low}
  labels: [regression, automation-candidate, e2e, critical]
  epic: {REGRESSION_EPIC_KEY}

[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {TEST_KEY}
  description: {full Description template — includes Gherkin if Candidate}
  fields:
    Test Status: Draft                          # custom field per jira-setup.md

[ISSUE_TRACKER_TOOL] Link Issues:
  linkType: "is tested by"
  outward: {TEST_KEY}
  inward:  {STORY_KEY}

# CI result flow (Stage 6) — custom script, no auto-import
for each {TEST_KEY} in run:
  [ISSUE_TRACKER_TOOL] Update Issue:
    issue: {TEST_KEY}
    fields:
      Test Status: {PASSED|FAILED|BLOCKED}
  [ISSUE_TRACKER_TOOL] Add Comment:
    issue: {TEST_KEY}
    body: "Run {date}: {result}. Env: {env}. CI: {url}"
```

### Workflow transition (both modalities — same state machine)

> **Prerequisite**: Load `/acli` skill before executing commands below.

```
[ISSUE_TRACKER_TOOL] Transition Issue:
  issue: {TEST_KEY}
  transition: start design   # Draft -> In Design
  # later: ready to run       # In Design -> Ready
  # later: automation review  # Ready -> In Review
  # later: approve to automate # In Review -> Candidate
  # OR:    for manual          # Ready -> Manual
```
