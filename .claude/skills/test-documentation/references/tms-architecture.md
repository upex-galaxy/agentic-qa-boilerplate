# TMS Architecture — Entity Model and Traceability

Definitive reference for the four TMS entities, their fields, their links, and the order in which to create them. Read this when creating any artifact, validating traceability, or fixing broken links.

> **Before publishing any TMS entity body (Test / TestPlan / TestExecution / TestRun) to Jira rich-text fields**, read `../../agentic-qa-core/references/jira-publishing-gotchas.md` — covers the two ADF conversion gotchas (`md-to-adf` mark collision + MCP batched custom-field rejection) that silently fail HTTP 400.

---

## 1. The four entities

Every QA-tested user story produces four artifact types. The model is tool-agnostic: the same structure applies in Jira+Xray, native Jira, Coda, Azure DevOps, and TestRail. Only the implementing issue types differ.

| Entity | Full name | Purpose | When created | Where the content lives |
|--------|-----------|---------|--------------|-------------------------|
| **US** | User Story / Backlog item | The requirement under test | Pre-QA | Description + ACs |
| **ATP** | Acceptance Test Plan | Approach, risk analysis, AC-to-TC coverage. Contains the Test Analysis. | Stage 1 (Planning) | ATP issue body |
| **ATR** | Acceptance Test Results | Execution results, findings, evidence. Contains the Test Report. | Stage 1 (created early), filled Stage 3 | ATR issue body |
| **TC** | Test Case | Individual test: precondition + action + expected. Lives in a test repository. | Stage 4 (Documentation) | TC issue body |

### Container per modality (load-bearing)

The entity model is tool-agnostic, but the **container** each entity lives in changes with the TMS modality. Resolve modality via `test-documentation/SKILL.md` §Phase 0 before using these mappings.

> **Items over fields (by excellence).** Every Plan is a **Test Plan** issue and every Run is a
> **Test Execution** issue — in BOTH modalities. These are native Jira work types (Xray-independent),
> so the standard does NOT branch on modality for *structure*; Xray only adds the run/coverage engine.
> The Story custom field for ATP/ATR is a **degraded fallback ONLY**, used when the Test Plan /
> Test Execution work types are unavailable in the instance. The column below labelled "field
> fallback" is that degraded mode, not the default.

| Entity | Items first (both modalities) | Degraded fallback (work type unavailable) |
|--------|-------------------------------|--------------------------------------------|
| **US** | Jira `Story` | — |
| **ATP** | A native Jira `Test Plan` issue, titled `ATP: {STORY-KEY}: {story title}`. Parented to **QA Master Test Plan**, linked to the Story via "tests". Real, queryable, JQL-filterable. Under Xray it is also the coverage anchor. | Story's `{{jira.acceptance_test_plan}}` field; else a `## Acceptance Test Plan (ATP)` comment. **No separate issue** — used only when the work type is absent. |
| **ATR** | A native Jira `Test Execution` issue, titled `ATR: {STORY-KEY}: Story Testing`. Parented to **QA Test Artifacts**. Under Xray it holds `Test Runs` per TC, plus Environment, Begin/End Date, and is the target of `[TMS_TOOL] Import Results` at the end of every CI run. | Story's `{{jira.acceptance_test_results}}` field; else a `## Acceptance Test Results (ATR)` comment. **No separate issue.** CI updates the Test Status field on each TC directly. |
| **TC** | Xray `Test` issue (type Manual / Cucumber / Generic), or a Jira-native `Test` custom issue type (set up per `references/jira-setup.md`) / `Task` with a `Test Type` custom field. Parented to **QA Test Repository**. | — |
| **Test Set / Precondition** | Native Jira work types, parented to **QA Test Artifacts** (first-class under Xray; selectable plain Jira issue types otherwise). | Group by labels + the QA Test Repository / QA Test Artifacts Epic when the work type is absent. |

Key consequences:

- **By excellence the Test Plan and Test Execution issues exist in both modalities** — they are real, queryable, filterable by JQL, carry real issue-links (Plan→scope, Run→Plan, Run→TC) and an independent status lifecycle. The Test Execution is the target of `[TMS_TOOL] Import Results` at the end of every CI run.
- **Only in the degraded fallback** (the work type is unavailable in the instance) does ATP/ATR content live on the Story custom field. There, traceability from a TC back to the plan/results walks via the "is tested by" link to the Story, then reads the Story's custom fields.
- The title grammar (`ATP: {STORY-KEY}: {story title}` / `ATR: {STORY-KEY}: Story Testing`) is identical in both modalities — in the fallback it identifies the section header in the Story comment, not an issue key.

---

## 2. Required fields per entity

### User Story (pre-existing)

| Field | Required | Notes |
|-------|----------|-------|
| ID | Yes | `{{PROJECT_KEY}}-{n}` auto-assigned |
| Title | Yes | |
| Acceptance Criteria | Yes | Testable conditions |
| Test Plan link (ATP) | Yes (once ATP exists) | `is tested by` ATP |
| Test Results link (ATR) | Yes (once ATR exists) | `is tested by` ATR |
| Test Cases links | No — never direct | TCs reach the Story THROUGH the ATP (`designs`) and ATR (`executes`), not via a direct Story↔TC link |

### ATP

| Field | Required | Value source |
|-------|----------|--------------|
| Name | Yes | `ATP: {STORY-KEY}: {story title}` |
| User Story link | Yes | Back-link to US |
| Test Coverage | Yes | AC-to-TC mapping table |
| Test Analysis | Yes | Rich text: approach, risks, test data, scenarios |
| Test Results link | Yes (after ATR exists) | Link to ATR |
| Complete flag | Yes | Set when filled |

### ATR

| Field | Required | Value source |
|-------|----------|--------------|
| Name | Yes | `ATR: {STORY-KEY}: Story Testing` |
| User Story link | Yes | Back-link to US |
| Test Coverage | Yes | Same AC-to-TC view as ATP (shared or mirrored) |
| Test Report | Yes | Rich text: session summary, env, findings, evidence |
| Complete flag | Yes | Set when filled |

### TC

| Field | Required | Value source |
|-------|----------|--------------|
| ID | Yes | Auto-generated (e.g., `{{PROJECT_KEY}}-456`) |
| Name | Yes | `{US_ID}: TC#: should <expected outcome> [<connector> <condition>] [given <precondition>]` |
| Acceptance Criterion | Yes | Which AC this TC covers (1:N from TC side) |
| User Story link | No — never direct | TC is NOT linked to the US directly; it reaches the US through the ATP/ATR |
| Test Plan link (ATP) | Yes | `is designed by` ATP (`test_design`) |
| Test Results link (ATR) | Yes | `is executed by` ATR (`test_execute`) |
| Precondition | Yes | Environment, login state, test data, DB state |
| Specification | Yes | Step-by-step verification (Gherkin or table) |
| Test Status | Yes | `NOT RUN` / `PASSED` / `FAILED` |
| Workflow Status | Yes | `Draft` / `In Design` / `Ready` / `Candidate` / `Manual` / `In Automation` / `In Review` / `Pull Request` / `Automated` / `Deprecated` |
| Priority | Yes | `Critical` / `High` / `Medium` / `Low` |
| Labels | Yes | At least one scope label (`regression` almost always) |
| Automation Candidate | Yes (boolean) | True when Candidate path |
| Parent | Yes | Regression Epic / test repository |

---

## 3. Entity relationships

```
+--------------------------------------------------------------------+
|                                                                    |
|   User Story ({{PROJECT_KEY}}-123)                                 |
|     |                                                              |
|     +--- is tested by ---> ATP (ATP: ...-123: <story title>)       |
|     |                        |                                     |
|     +--- is tested by ---> ATR (ATR: ...-123: Story Testing)        |
|                              |                                     |
|         ATP designs (test_design)   ATR executes (test_execute)    |
|                  \                          /                      |
|                   v                        v                       |
|                  [ TC-1, TC-2, TC-3, ... TC-N ]                     |
|                     |    |    |                                    |
|                     |    |    +-- is designed by ATP, executed by ATR, covers AC |
|                     |    +------- is designed by ATP, executed by ATR, covers AC |
|                     +------------ is designed by ATP, executed by ATR, covers AC |
|                                                                    |
|   The Story links ONLY to ATP and ATR (`test`). TCs are NOT linked |
|   to the Story directly — they aggregate to it THROUGH the ATP     |
|   (`designs`) and ATR (`executes`). All edges render bidirectionally:|
|     US <-> ATP <-> TC   (designs / is designed by)                 |
|     US <-> ATR <-> TC   (executes / is executed by)                |
|     ATP <-> ATR         (plan / results)                           |
+--------------------------------------------------------------------+
```

### Cardinality

| From | To | Cardinality | Link direction |
|------|----|-------------|----------------|
| US | ATP | 1:1 | `is tested by` (`test`) |
| US | ATR | 1:1 | `is tested by` (`test`) |
| US | TC | 1:N | **via ATP/ATR — no direct link** (TCs aggregate through `designs` / `executes`) |
| ATP | ATR | 1:1 | Bidirectional (plan / results) |
| ATP | TC | 1:N | ATP `designs` TC / TC `is designed by` ATP (`test_design`) |
| ATR | TC | 1:N | ATR `executes` TC / TC `is executed by` ATR (`test_execute`) |
| TC | AC | N:1 (or N:M) | TC covers one or more ACs |

Given any one of the four, you must be able to navigate to the other three. That is what "traceability" means. The US↔TC navigation is INDIRECT by design: from the Story walk `is tested by` → ATP/ATR, then walk `designs` / `executes` → TCs. Linking every TC to the Story directly was dropped because it floods the Story panel with noise; the ATP/ATR are the single aggregation point.

---

## 4. Traceability rules

### Mandatory links

| Entity | Required link | Type / direction | When to set |
|--------|---------------|------------------|-------------|
| **ATP** | User Story | `is tested by` (`test`) | At creation |
| **ATP** | Test Results (ATR) | Bidirectional (plan / results) | After ATR is created |
| **ATP** | each TC | ATP `designs` TC (`test_design`) | At TC creation |
| **ATR** | User Story | `is tested by` (`test`) | At creation |
| **ATR** | each TC | ATR `executes` TC (`test_execute`) | At TC creation |
| **TC** | Test Plan (ATP) | `is designed by` ATP (`test_design`) | At creation |
| **TC** | Test Result (ATR) | `is executed by` ATR (`test_execute`) | At creation |
| **TC** | Acceptance Criterion | AC reference | At creation |

A TC is **NOT** linked to the User Story directly — it reaches the Story through the ATP (`designs`) and ATR (`executes`). A TC that is missing its ATP or ATR link is broken — use `fix-traceability` to repair. **The Xray-internal attach (`plan add-tests` / `exec add-tests`) creates NO Jira links** — the `designs`/`executes` Jira edges MUST be created explicitly via `[ISSUE_TRACKER_TOOL]` (`/acli`). (Slug-layer mechanics live in `agentic-qa-core/references/traceability-linking.md` §3/§9.)

### Validation checklist (before marking Complete)

- [ ] ATP links to User Story (`is tested by`) AND ATR
- [ ] ATR links to User Story (`is tested by`)
- [ ] Every TC links to ATP (`is designed by`) and ATR (`is executed by`) — NOT to the User Story directly
- [ ] No direct Story↔TC links exist (TCs aggregate via ATP/ATR)
- [ ] ATP Test Coverage maps all ACs to TCs
- [ ] ATR Test Coverage reflects execution results
- [ ] User Story panel shows references to ATP and ATR only (TCs reachable one hop further, through the ATP/ATR)

---

## 5. Creation and linking order

Artifacts must be created in a specific sequence. Creating TCs first, ATP second leaves orphaned references that are painful to repair.

### The sequence

```
Step 1. Create ATP
        -> link ATP to User Story (Story `is tested by` ATP, `test`)
        (ATR link left empty for now)

Step 2. Create ATR
        -> link ATR to User Story (Story `is tested by` ATR, `test`)

Step 3. Update ATP
        -> link ATP to ATR (bidirectional plan/results)

Step 4. For each TC (as Stage 4 progresses):
        Create TC
        -> link TC to ATP (ATP `designs` TC / TC `is designed by` ATP, `test_design`)
        -> link TC to ATR (ATR `executes` TC / TC `is executed by` ATR, `test_execute`)
        -> link TC to AC
        # Do NOT link TC to the User Story directly — it aggregates via ATP/ATR.
```

### Why this order

1. **ATP first**: the plan must exist before execution results can reference it. Even if the Test Analysis content is filled later, the artifact is created early so that TCs can link to it.
2. **ATR second**: created early so the ATP can reference it. Test Report content is filled after execution.
3. **ATP <-> ATR third**: once both exist, wire up the bidirectional link.
4. **TCs last**: by the time a TC is created, both ATP and ATR exist, so the `designs` (ATP) and `executes` (ATR) links are set at creation. The TC is bound to the Story's graph through those two edges — never via a direct Story↔TC link.

### Pseudocode — full sequence

> **Prerequisite**: Load `/xray-cli` skill (Modality jira-xray) — in Modality jira-native these `[TMS_TOOL]` calls fall through to `[ISSUE_TRACKER_TOOL]`, so load `/acli` instead. See §9 for the per-modality split.

```
[TMS_TOOL] Create ATP:
  name: ATP: {STORY-KEY}: {story title}
  story: {from User Story title}            # Story `is tested by` ATP (test)
  # Parent Epic: QA Master Test Plan

[TMS_TOOL] Create ATR:
  name: ATR: {STORY-KEY}: Story Testing
  story: {from User Story title}            # Story `is tested by` ATR (test)
  # Parent Epic: QA Test Artifacts

[TMS_TOOL] Update ATP:
  id: {from ATP created above}
  results: {from ATR name created above}    # ATP <-> ATR (plan / results)

[TMS_TOOL] Create TC:
  name: {per TC naming convention}
  test-plan: {from ATP name}                # ATP `designs` TC (test_design)
  test-result: {from ATR name}              # ATR `executes` TC (test_execute)
  ac: {from the Acceptance Criterion this TC covers}
  project: {{PROJECT_KEY}}
  # NO `story:` link — the TC is NOT linked to the User Story directly.
  # It aggregates to the Story through the ATP (`designs`) and ATR (`executes`).
  # The Xray-internal attach creates NO Jira links — the designs/executes edges
  # are created explicitly via [ISSUE_TRACKER_TOOL] (/acli). Slug layering:
  # traceability-linking.md §3/§9.
```

---

## 6. Naming conventions (canonical)

| Entity | Pattern | Example |
|--------|---------|---------|
| User Story | `{{PROJECT_KEY}}-{n}` | `PROJ-123` |
| ATP | `ATP: {STORY-KEY}: {story title}` | `ATP: PROJ-123: Apply discount at checkout` |
| ATR | `ATR: {STORY-KEY}: Story Testing` | `ATR: PROJ-123: Story Testing` |
| TC (TMS title) | `{US_ID}: TC#: should <expected outcome> [<connector> <condition>] [given <precondition>]` | `PROJ-101: TC1: should grant access when credentials are valid` |
| TC (code / ATC) | `{US_ID}: should <behavior> when <condition>` | `PROJ-101: should display error when password is incorrect` |

Rules:

1. ATP and ATR names always include the User Story ID. This makes them searchable, unique per story, and impossible to confuse across stories.
2. TC names follow the pattern `{US_ID}: TC#: should <expected outcome> [<connector> <condition>] [given <precondition>]`, where `CORE` is the expected outcome (verb + object phrased after `should`, e.g., `grant access`, `reject login`) and `CONDITIONAL` is the optional connector clause (`when …` / `if …`, e.g., `when credentials are valid`, `if password is incorrect`) plus an optional `given …` precondition. The prefix is ALWAYS the User Story ID, in every modality; Test Set membership is expressed as an issue link, never baked into the title.
3. Code-side IDs match the TMS-generated key exactly. The `@atc('PROJ-456')` decorator uses the TMS issue key, not an invented module prefix.
4. Module prefixes (e.g., `AUTH-`, `ORD-`) are used only for local folder/file organization under `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/test-cases/` — they are not the canonical ID.

---

## 7. Completed User Story view

When all In-Sprint Testing stages are complete, the User Story panel in the TMS should look like this:

```
User Story: PROJ-123 — <Story Title>

| Test Plan (is tested by)    | ATP: PROJ-123: Apply discount at checkout | Complete |
| Test Results (is tested by) | ATR: PROJ-123: Story Testing              | Complete |
(No direct Test Case links on the Story — TCs are reached through the ATP/ATR.)

ATP (ATP: PROJ-123: Apply discount at checkout)
  User Story:    PROJ-123 (tests / is tested by)
  Test Analysis: [filled]
  Designs:       TC-1, TC-2, TC-3, TC-4        (test_design)
  Test Coverage: AC1 -> TC-1; AC2 -> TC-2; AC3 -> TC-3, TC-4
  Test Results:  ATR: PROJ-123: Story Testing
  Complete:      Yes

ATR (ATR: PROJ-123: Story Testing)
  User Story:    PROJ-123 (tests / is tested by)
  Test Report:   [filled]
  Executes:      TC-1, TC-2, TC-3, TC-4        (test_execute)
  Test Coverage: AC1 -> TC-1 PASSED; AC2 -> TC-2 PASSED; AC3 -> TC-3 PASSED, TC-4 FAILED
  Complete:      Yes

Test Cases (each: is designed by ATP, is executed by ATR — NOT linked to the US)
  TC-1 | PASSED | AC1 | should <behavior> when <condition>
  TC-2 | PASSED | AC2 | should <behavior> when <condition>
  TC-3 | PASSED | AC3 | should <behavior> when <condition>
  TC-4 | FAILED | AC3 | should <behavior> when <condition>
```

### Completeness criteria

A User Story is fully documented when:

1. ATP exists, is linked, and is marked Complete.
2. ATR exists, is linked, and is marked Complete.
3. Every TC has a Test Status (`PASSED`, `FAILED`, or `NOT RUN`).
4. Every AC has either at least one **documented** TC OR an explicit Deferred note in the prioritization report. The documented TC set is intentionally sparse — only the regression-worthy scenarios (Candidate + Manual) are persisted; the wide 1:N derivation happened upstream (in `/sprint-testing` planning + exploration) and most of it is correctly Deferred (no TMS TC). Do NOT inflate documentation to "N TCs per AC" — that is a design/execution concern, not a documentation one.
5. Where a regression-worthy scenario IS persisted, its TC is technique-shaped: a documented boundary TC uses BVA values, a documented state TC covers the transition, etc. (`agentic-qa-core/references/test-design-doctrine.md`). Technique governs the SHAPE of what you document, not how MUCH you document.
6. ATP and ATR are bidirectionally linked, and both are linked to the US via `is tested by`.
7. Every TC links to the ATP (`is designed by`) and ATR (`is executed by`) — and NOT to the US directly.

Any failing criterion -> the story is not ready to close QA.

---

## 8. TC workflow state machine

> **Substrate reference**: state and transition names below match the canonical UPEX Jira workflow in `.agents/jira-workflows.json` (see `.agents/jira-required.yaml` `work_types.test_case`). Skills resolve them via `{{jira.status.test_case.<slug>}}` / `{{jira.transition.test_case.<slug>}}`. Rename detection runs via `bun run jira:sync-workflows`.

The TC workflow spans three IQL stages. Key transitions: `start_design` (Draft -> In Design), `ready_to_run` (In Design -> Ready), `for_manual` (Ready -> Manual), `automation_review_from_ready` (Ready -> In Review), `approve_to_automate` (In Review -> Candidate), `start_automation` (Candidate -> In Automation), `create_pr` (In Automation -> Pull Request), `merged` (Pull Request -> Automated). Never skip states; use `back_from_ready` / `back_from_in_design` for rework, `deprecated` (any -> Deprecated) to retire a TC.

```
Stage 2 (Execution)     Stage 4 (Documentation)     Stage 5 (Automation)
-----------------       -----------------------     ---------------------

Draft -> In Design -> Ready -+-- for manual --> Manual         (terminal manual)
                             |
                             +-- automation review --> In Review
                                                         |
                                                         +-- approve to automate --> Candidate
                                                                                         |
                                                                                         +-- start automation --> In Automation
                                                                                                                     |
                                                                                                                     +-- create PR --> Pull Request
                                                                                                                                          |
                                                                                                                                          +-- merged --> Automated

Any state -> Deprecated (when feature is removed)
```

Rules:
- No state can be skipped. Draft must go through In Design before Ready; Ready cannot go straight to Automated.
- Backward transitions are limited: only "back to In Design" (rework) and "any state to Deprecated".
- Manual is not a dead end: a Manual TC can later re-enter In Review if ROI changes.

---

## 9. Pseudocode — common entity operations

All operations use `[TMS_TOOL]` for TMS-specific actions and `[ISSUE_TRACKER_TOOL]` for generic issue operations. Resolution via CLAUDE.md Tool Resolution (Xray CLI, Jira CLI, or MCP fallback).

### List and read

> **Prerequisite**: Load `/xray-cli` skill (Modality jira-xray). In Modality jira-native, load `/acli` — these calls map to JQL/search via `[ISSUE_TRACKER_TOOL]`.

```
[TMS_TOOL] List ATPs:
  project: {{PROJECT_KEY}}
  ticket: {from User Story ID}

[TMS_TOOL] List ATRs:
  project: {{PROJECT_KEY}}
  ticket: {from User Story ID}

[TMS_TOOL] List TCs:
  project: {{PROJECT_KEY}}
  ticket: {from User Story ID}

[TMS_TOOL] Get TC:
  id: {from TC ID}
```

### Create

Pseudocode splits by TMS modality — pick the block matching the resolution from SKILL.md §Phase 0. Full per-modality reference in SKILL.md §Quick reference.

#### Parallel TC creation (default for N > 10)

When the candidate list has more than 10 TCs, creating them serially burns the orchestrator's context with raw API responses. Shard the list into chunks of ~5-10 TCs per subagent, cap total subagents at 10. The orchestrator pre-creates the ATP / ATR (Phase 3 §Linking order steps 1-3) **before** dispatching — only the per-TC writes (step 4) are parallelised. See SKILL.md §Subagent Dispatch Strategy for the per-phase pattern table.

**Sharding rule**: `ceil(N / 10)` subagents, each handling roughly equal-sized chunks. If `N > 100`, chunks must be larger than 10 each (cap is on subagent count, not chunk size). Each dispatch follows the 6-component briefing format in `.claude/skills/agentic-qa-core/references/briefing-template.md`.

##### Modality jira-xray (subagent loads `/xray-cli`)

Briefing (6 components per `agentic-qa-core/references/briefing-template.md`):

```
Goal: Create <K> Xray Test issues in Jira project <PROJECT_KEY> for chunk <I>/<TOTAL>, link each to ATP <ATP_KEY> (designs) and ATR <ATR_KEY> (executes), and return their issue keys. Do NOT link the Tests to the Story <STORY_KEY> directly — the Story is linked only to the ATP and ATR.

Context docs:
  - <PBI_FOLDER>/test-specs/<spec>.md (TC definitions for this chunk)
  - .agents/jira-fields.json (custom field IDs)
  - .claude/skills/test-documentation/references/tms-architecture.md (TC body shape, naming, linking order)
  - .claude/skills/test-documentation/references/jira-test-management.md §7 (Description template)

Skills to load: /xray-cli, /acli

Exact instructions:
  1. For each TC in the chunk:
     a. [TMS_TOOL] Create Test: project=<PROJECT_KEY>, type={Cucumber|Manual}, title="{per TC naming convention}". For Manual: create WITHOUT inline steps (Xray Cloud drops steps on create), then add each step via [TMS_TOOL] add-step. For Cucumber: pass gherkin={from spec}.
     b. Capture the returned issue key as <TEST_KEY>.
     c. [ISSUE_TRACKER_TOOL] Update Issue: issue=<TEST_KEY>, description={full Description template per jira-test-management.md §7}.
     d. [TMS_TOOL] AddTests: testPlan=<ATP_KEY>, tests=[<TEST_KEY>].   # Xray-internal membership only — creates NO Jira link
     e. [TMS_TOOL] AddTests: execution=<ATR_KEY>, tests=[<TEST_KEY>].  # Xray-internal membership only — creates NO Jira link
     f. Jira-layer design/execute edges (SEPARATE from steps d/e): the Xray attach creates NO Jira links (confirmed, traceability-linking.md §9), so create them explicitly via [ISSUE_TRACKER_TOOL] (/acli): [ISSUE_TRACKER_TOOL] Link Issues linkType={{jira.link_types.test_design.name}} (ATP `designs` TC) and linkType={{jira.link_types.test_execute.name}} (ATR `executes` TC), then verify direction per traceability-linking.md §2/§4.
     g. Do NOT link the Test to the Story <STORY_KEY> directly — coverage aggregates to the Story through the ATP/ATR.
  2. Apply labels per the methodology naming convention (see `tms-conventions.md` §Labels).

Report format:
  JSON array per TC:
  [
    {
      "tc_local_id": "<spec id>",
      "issue_key": "<PROJ>-<N>",
      "linked_to_atp": true,
      "linked_to_atr": true,
      "designs_link": true,
      "executes_link": true,
      "linked_to_story": false,
      "errors": []
    },
    ...
  ]
  Trailing summary: { "chunk": <I>, "created": K, "failed": 0|N, "duration_seconds": <int> }

Rules:
  - Do NOT modify the ATP or ATR — only link new tests to them.
  - Do NOT exceed 10 sustained writes/sec inside the subagent (xray-cli already throttles, but be aware).
  - On 429 or 5xx: retry with exponential backoff up to 3 times, then mark the TC as failed and continue with the rest of the chunk.
  - On 4xx (excluding 429): stop the chunk and report partial state.
  - Critical Rule #8 (File Operations): never overwrite an existing TC silently — if the summary already exists, report and skip.
```

##### Modality jira-native (no Xray plugin; subagent loads `/acli`)

Briefing (6 components per `agentic-qa-core/references/briefing-template.md`):

```
Goal: Create <K> Jira Test issues in project <PROJECT_KEY> for chunk <I>/<TOTAL>, link each to the parent Story <STORY_KEY> via "is tested by", and return their issue keys.

Context docs:
  - <PBI_FOLDER>/test-specs/<spec>.md (TC definitions for this chunk)
  - .agents/jira-fields.json (custom field IDs auto-discovered by `bun run jira:sync-fields`)
  - .agents/jira-required.yaml (custom-field manifest)
  - .claude/skills/test-documentation/references/jira-setup.md §3 (Modality jira-native field layout)
  - .claude/skills/test-documentation/references/jira-test-management.md §7 (Description template)

Skills to load: /acli

Exact instructions:
  1. For each TC in the chunk:
     a. [ISSUE_TRACKER_TOOL] Create Issue: project=<PROJECT_KEY>, issueType=Test, summary="{per TC naming convention}", priority={Critical|High|Medium|Low}, labels=[regression, ...], epic=<REGRESSION_EPIC_KEY>.
     b. Capture the returned issue key as <TEST_KEY>.
     c. [ISSUE_TRACKER_TOOL] Update Issue: issue=<TEST_KEY>, description={full Description template per jira-test-management.md §7}, fields={ {{jira.test_status}}: Draft, {{jira.to_be_automated}}: <bool> }.
     d. [ISSUE_TRACKER_TOOL] Link Issues: linkType={{jira.link_types.test.name}}, outward=<TEST_KEY>, inward=<STORY_KEY>.   # Story is tested by Test
  2. Do NOT recreate ATP/ATR custom fields on the Story — those were already populated by the orchestrator before dispatch.

Report format:
  JSON array per TC:
  [
    {
      "tc_local_id": "<spec id>",
      "issue_key": "<PROJ>-<N>",
      "linked_to_story": true,
      "errors": []
    },
    ...
  ]
  Trailing summary: { "chunk": <I>, "created": K, "failed": 0|N, "duration_seconds": <int> }

Rules:
  - Custom-field IDs come from .agents/jira-fields.json — do NOT hardcode `customfield_*` numbers.
  - On 429 or 5xx: retry with exponential backoff up to 3 times.
  - On 4xx (excluding 429): stop the chunk and report partial state.
  - Critical Rule #8 (File Operations): never overwrite an existing TC silently — if the summary already exists, report and skip.
  - Critical Rule #1 (Login Credentials): ATLASSIAN_API_TOKEN comes from .env, never hardcode.
```

##### Aggregation in the main thread

After all parallel subagents return, the orchestrator:

1. Concatenates the JSON arrays into a single creation report.
2. Sums totals (created / failed) and computes per-chunk duration.
3. Feeds the issue-key list into the Traceability linking step (this section §4 + §5 step "for each TC").
4. If any chunk reported `failed > 0`, surface the failed TCs to the user before proceeding to traceability linking. Do NOT auto-retry across chunks; let the user decide retry / skip / abort per the error protocol in `agentic-qa-core/references/orchestration-doctrine.md`.

##### Fallback to serial (N <= 10)

For N <= 10 TCs, classify inline — the dispatch overhead is not justified. The serial flows below (Modality jira-xray and Modality jira-native) remain canonical. They also describe the procedure each parallel subagent runs internally for its assigned chunk.

#### Modality jira-xray

> **Prerequisite**: Load `/xray-cli` and `/acli` skills before executing commands below.

```
[TMS_TOOL] Create TestPlan:
  project: {{PROJECT_KEY}}
  title: ATP: {STORY-KEY}: {story title}
  # Parent Epic: QA Master Test Plan

[TMS_TOOL] Create Execution:
  project: {{PROJECT_KEY}}
  title: ATR: {STORY-KEY}: Story Testing
  testPlan: {ATP_KEY}
  environment: {from session context}
  # Parent Epic: QA Test Artifacts

[ISSUE_TRACKER_TOOL] Link Issues:
  linkType: {{jira.link_types.test.name}}   # Story is tested by Test Plan (ATP)
  outward: {ATP_KEY}
  inward:  {STORY_KEY}

[ISSUE_TRACKER_TOOL] Link Issues:
  linkType: {{jira.link_types.test.name}}   # Story is tested by Test Execution (ATR)
  outward: {ATR_KEY}
  inward:  {STORY_KEY}

[TMS_TOOL] Create Test:
  project: {{PROJECT_KEY}}
  type: Cucumber | Manual | Generic
  title: {per TC naming convention}
  # Cucumber/Generic: pass gherkin/definition here.
  # Manual: create WITHOUT inline steps (Xray Cloud drops steps on create),
  #         then add each step via [TMS_TOOL] add-step.

[TMS_TOOL] AddTests:                          # Xray-internal membership only — creates NO Jira link
  testPlan: {ATP_KEY}
  tests: [{TEST_KEY}]
[TMS_TOOL] AddTests:                          # Xray-internal membership only — creates NO Jira link
  execution: {ATR_KEY}
  tests: [{TEST_KEY}]

# Jira-layer coverage edges (ATP designs TC, ATR executes TC). The two AddTests
# calls above create NO Jira links (confirmed, traceability-linking.md §9) — these
# are SEPARATE from the Xray-internal membership and MUST be created explicitly:
[ISSUE_TRACKER_TOOL] Link Issues:
  linkType: {{jira.link_types.test_design.name}}    # ATP designs TC / TC is designed by ATP
  outward: {ATP_KEY}
  inward:  {TEST_KEY}
[ISSUE_TRACKER_TOOL] Link Issues:
  linkType: {{jira.link_types.test_execute.name}}   # ATR executes TC / TC is executed by ATR
  outward: {ATR_KEY}
  inward:  {TEST_KEY}
# Do NOT link the Test to {STORY_KEY} directly — it aggregates via ATP/ATR.
# Resolve slugs + verify direction per traceability-linking.md §2/§4.
```

#### Modality jira-native — DEGRADED FALLBACK ONLY (Test Plan / Test Execution work types unavailable)

> **Items first**: by excellence a native Jira `Test Plan` issue (`ATP: {STORY-KEY}: {story title}`)
> and `Test Execution` issue (`ATR: {STORY-KEY}: Story Testing`) are created in jira-native too —
> use the `[TMS_TOOL] Create TestPlan` / `Create Execution` blocks above, since both are native
> Jira work types. The Story-field path below is the **degraded fallback**, used ONLY when those
> work types are absent from the instance.
>
> **Prerequisite**: Load `/acli` skill before executing commands below.

```
# ATP — fallback only: lives on the Story when no Test Plan work type
[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {STORY_KEY}
  fields:
    {{jira.acceptance_test_plan}}: {Test Analysis body}
  labels: +shift-left-reviewed

[ISSUE_TRACKER_TOOL] Add Comment:
  issue: {STORY_KEY}
  body: "=== ATP: {STORY-KEY}: {story title} ===\n{Test Analysis body}"

# ATR — fallback only: lives on the Story when no Test Execution work type
[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {STORY_KEY}
  fields:
    {{jira.acceptance_test_results}}: {Test Report body}

[ISSUE_TRACKER_TOOL] Add Comment:
  issue: {STORY_KEY}
  body: "=== ATR: {STORY-KEY}: Story Testing ===\n{Test Report body}"

# TC — Jira-native Test issue
[ISSUE_TRACKER_TOOL] Create Issue:
  project: {{PROJECT_KEY}}
  issueType: Test                              # or Task + a Test Type custom field
  summary: {per TC naming convention}
  epic: {REGRESSION_EPIC_KEY}
  labels: [regression, ...]

[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {TEST_KEY}
  description: {full TC template}
  fields:
    Test Status: Draft

[ISSUE_TRACKER_TOOL] Link Issues:
  linkType: {{jira.link_types.test.name}}   # Story is tested by Test
  outward: {TEST_KEY}
  inward:  {STORY_KEY}
```

### Update

> **Prerequisite**: Load `/xray-cli` skill (Modality jira-xray). In Modality jira-native, load `/acli` — these update calls become `[ISSUE_TRACKER_TOOL] Update Issue` on the Story or Test customfields.

```
[TMS_TOOL] Update ATP:
  id: {from ATP ID}
  results: {from ATR name}
  analysis: {from test analysis content}
  complete: true

[TMS_TOOL] Update ATR:
  id: {from ATR ID}
  report: {from test report content}
  complete: true

[TMS_TOOL] Update TC:
  id: {from TC ID}
  status: PASSED
  workflow-status: Candidate
  precondition: {from test environment details}
  spec: {from step-by-step specification}
```

### Verify traceability

> **Prerequisite**: Load `/xray-cli` skill (Modality jira-xray). In Modality jira-native, load `/acli` and walk the links manually via `[ISSUE_TRACKER_TOOL] Search Issues`.

```
[TMS_TOOL] Verify Traceability:
  issue: {from ticket ID}
```

Expected output: all links verified — US `is tested by` ATP and ATR; each TC `is designed by` ATP and `is executed by` ATR; NO direct US↔TC link. If any link is missing (or a stray Story↔TC link exists), apply the fixes in §10.

---

## 10. Fixing broken traceability

Common failure modes and their fixes:

| Issue | Fix |
|-------|-----|
| TC linked directly to Story | Remove the direct Story↔TC link — TCs aggregate via ATP/ATR, never link to the Story directly |
| TC not designed-by ATP | Link ATP `designs` TC (`test_design`) |
| TC not executed-by ATR | Link ATR `executes` TC (`test_execute`) |
| ATP not linked to ATR | Update ATP with ATR reference |
| ATP not linked to Story | Link Story `is tested by` ATP (`test`) |
| ATR not linked to Story | Link Story `is tested by` ATR (`test`) |
| TC name doesn't follow convention | Rename TC to `{US_ID}: TC#: should <expected outcome> [<connector> <condition>] [given <precondition>]` |
| ATP name wrong | Rename to `ATP: {STORY-KEY}: {story title}` |
| ATR name wrong | Rename to `ATR: {STORY-KEY}: Story Testing` |
| TC has no AC link | Identify which AC it covers and add the reference |

Procedure:

1. Run `[TMS_TOOL] Verify Traceability` — read the gap list.
2. For each issue, apply the fix above.
3. Re-run `[TMS_TOOL] Verify Traceability` to confirm all links are resolved.
4. Log what was fixed in a comment on the User Story for audit trail.

---

## 11. Reference implementation — Jira + Xray

The canonical implementation this file was derived from uses Jira with Xray. Mapping:

| Generic concept | Jira/Xray implementation |
|-----------------|-------------------------|
| Test Case ID | Jira issue key (e.g., `PROJ-123`) |
| Test Case issue type | Xray Test |
| Test Plan | Jira `Test Plan` issue (items first; Story custom field = degraded fallback only) |
| Test Execution (ATR) | Jira `Test Execution` issue (Xray adds the run engine) |
| Regression Epic | Jira Epic with label `test-repository` |
| Results import | Xray REST API (JUnit / Cucumber formats) |
| CLI | `bun xray` (load `/xray-cli` skill) |

Other TMS tools (Coda, Azure DevOps, TestRail) implement the same four-entity model with different issue types. The naming conventions, linking order, and traceability rules above apply unchanged.
