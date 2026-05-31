# Reporting Templates (Stage 3)

> **Subagent context**: this file is part of the "Context docs" briefing component for the Stage 3 Reporting subagent (see `sprint-testing/SKILL.md` §Subagent Dispatch Strategy and `sprint-orchestration.md` §"Briefing 4 — Stage 3 Reporting subagent").

Stage 3 Reporting artifacts for in-sprint QA: ATR Test Report body, bug report template, and QA comment templates. Output written into the ticket PBI folder and mirrored to the TMS.

This reference is for manual, in-sprint reporting RIGHT NOW. It does NOT cover Stage 4 formal TMS documentation or ROI scoring (see `test-documentation`), Bug Analysis *planning* variant inside an ATP (see `acceptance-test-planning.md`), or automation review artifacts (see `test-automation`).

> **Before publishing ATR / bug-report / QA comment bodies to Jira rich-text fields**, read `../../agentic-qa-core/references/jira-publishing-gotchas.md` — covers the two ADF conversion gotchas (`md-to-adf` mark collision + MCP batched custom-field rejection) that silently fail HTTP 400.

---

## 1. Bug Report Template

> **Prerequisite**: Load `/acli` skill before executing any `[ISSUE_TRACKER_TOOL]` call in this section (duplicate search, Create issue, comment back-reference, search fields). Skip if Session Start §0.1 in `SKILL.md` already loaded it.

### 1.1 When to file a bug

File a bug when Stage 2 execution reveals a confirmed defect. Before filing:

1. Retest the bug once to confirm reproducibility (UI via `[AUTOMATION_TOOL]`, API via `[API_TOOL]`, data via `[DB_TOOL]`).
2. Confirm with the user. Never file a bug without explicit human agreement that it is a real defect.
3. Search for duplicates in `[ISSUE_TRACKER_TOOL]` using the naming pattern below.

### 1.2 Bug summary (title)

Format: `<EPIC>: <COMPONENT>: <ISSUE_SUMMARY>`

Examples:
- `CheckoutFlow: Payment: Error message not shown for incorrect password`
- `UserAuth: Login: Session expires without warning`
- `API: Users: PUT /users/settings returns 500 on save`

### 1.3 Description (Jira body)

```
_SUMMARY_
[One-paragraph summary of the bug and its impact]

----

_STEPS TO REPRODUCE_

h4. [Step 1 - Precondition (user, login, data state)]
h4. [Step 2 - Navigation]
h4. [Step 3 - Action that triggers bug]
h4. [Step 4 - Observe bug]

----

_TECHNICAL ANALYSIS_

* _File:_ [path if known]
* _Function:_ [name/component]
* _Network:_ [API call info if relevant]
* _Console:_ [error messages]

----

_IMPACT_

* [Affected users]
* [Blocked functionality]
* [Business impact]

----

_RELATED STORIES_

* Related: [{{PROJECT_KEY}}-XXX]
* Blocks: [other issues]
```

### 1.4 Severity matrix

| Severity | Criteria | Examples |
|----------|----------|----------|
| **Critical** | Core blocked, no workaround, data loss | Login broken, checkout fails, data corruption |
| **Major** | Main feature broken, workaround hard | Search returns wrong results, form does not submit |
| **Moderate** | Feature issue with easy workaround | Sorting broken but filtering works |
| **Minor** | Minor issue, low priority | Edge-case validation missing |
| **Trivial** | Cosmetic only | Typo, slight misalignment |

### 1.5 Priority mapping (severity -> priority)

| Severity | `priority.name` |
|----------|-----------------|
| Critical | Highest |
| Major | High |
| Moderate | Medium |
| Minor | Low |
| Trivial | Lowest |

### 1.6 Error type (infer from behaviour)

| Error Type | When to use |
|------------|-------------|
| Functional | Feature does not match AC |
| Visual | Layout, styling, responsive |
| Content | Wrong text / typos / translations |
| Performance | Slow, timeouts, memory |
| Crash | 500, white screen, fatal |
| Data | Bad calculations, corruption |
| Integration | External service failure |
| Security | Auth bypass, data exposure, XSS |

### 1.7 Environment inference

| URL pattern | Value |
|-------------|-------|
| `localhost`, `127.0.0.1` | Dev |
| `qa.`, `-qa.` | QA |
| UAT host | UAT |
| `staging.` or `-staging.` | Staging |
| Production domain | Production |

### 1.8 Root cause

| Value | When |
|-------|------|
| Code Error | Logic bug in source |
| Config/Env Error | Env var, feature flag, config |
| Environment Error | Infra / deploy / CI |
| Requirement Error | Spec wrong or ambiguous |
| Working As Designed (WAD) | Not a bug |
| Third-Party Error | Library / framework defect |
| Integration Error | External service failure |
| Data Error | DB corruption, bad migration |

If unknown, set Root Cause Text to a short note such as "API returns 500 - server-side investigation needed".

### 1.9 Labels

Always include: `bug`, `exploratory-testing`. Append module or domain labels when relevant (e.g. `checkout`, `billing`, `api`).

### 1.10 Custom fields

#### 1.10.1 Custom field detection (per project)

Bug custom fields vary by Jira workspace. Before creating a bug, read `.agents/jira-fields.json` once. For each row in the table below:

- **If the slug exists** in `jira-fields.json` → populate the custom field via `[ISSUE_TRACKER_TOOL] Edit Issue ... --field <id>`. The slug column shows the canonical reference; the linter validates it against `.agents/jira-required.yaml`.
- **If the slug does NOT exist** → omit the custom-field write and include the content as a labeled section in the bug's **Description** field instead, using the headings from the "Description fallback" column.

The Description always carries Steps to Reproduce. Any field that falls back here is appended as an additional section (see template at §1.10.3).

#### 1.10.2 Field table

| Field | Slug | Type | Description fallback heading |
|-------|------|------|------------------------------|
| Actual Result | `{{jira.actual_result}}` | string (paragraph) | `## Actual Result` |
| Expected Result | `{{jira.expected_result}}` | string (paragraph) | `## Expected Result` |
| Error Type | `{{jira.error_type}}` | option | `**Error Type**: <value>` |
| Severity | `{{jira.severity}}` | option | `**Severity**: <value>` |
| Test Environment | `{{jira.test_environment}}` | option | `**Test Environment**: <value>` |
| Root Cause | `{{jira.root_cause}}` | option | `## Root Cause: <value>` |
| Workaround | `{{jira.workaround}}` | string (paragraph) | `## Workaround` |
| Evidence | `{{jira.evidence}}` | string (paragraph) | `## Evidence` |
| Fix | `{{jira.fix}}` | option | `**Fix**: bugfix \| hotfix` |

**Field format rules:** string fields pass a plain string; dropdowns pass `{"value": "Option"}`; omit optional fields (do not pass `null`).

Convention: paragraph-style fields get `## Section` headings (multi-line content); option-style fields get `**Label**: value` inline (single-line content).

#### 1.10.3 Description fallback template

When custom fields are missing, the bug Description should follow this structure. **Only include sections for fields that fall back here** — if `severity` exists as a custom field but `actual_result` does not, the Description has Steps to Reproduce + `## Actual Result` (no Severity inline; severity goes to its custom field).

```
## Steps to Reproduce

1. ...
2. ...

## Actual Result

{what actually happened}

## Expected Result

{what should have happened}

**Error Type**: <option>
**Severity**: <option>
**Test Environment**: <option>

## Root Cause

{if known after triage}

## Workaround

{if applicable}

## Evidence

- Screenshot: <link>
- Trace: <link>
- Logs: <link>

**Fix**: bugfix
```

#### 1.10.4 Error handling when a custom-field write fails or a slug is missing

There are two distinct failure modes:

1. **Slug missing from `.agents/jira-fields.json`** — the methodology declares the slug in `jira-required.yaml` but the user's Jira workspace does not have a matching custom field. Use the **Description fallback** (§1.10.3) — this is the documented degradation path, not an error. No user-facing warning needed beyond noting in the QA comment that the field landed in the Description.
2. **Slug exists but the write fails at runtime** — the field id resolved, but `[ISSUE_TRACKER_TOOL] Edit Issue` rejected the value (permissions, screen scheme, value-validation). **DO NOT** attempt to discover or guess alternative field IDs — Jira custom-field IDs are tenant-specific, guessing leads to silent data corruption.

**Protocol on runtime failure**:

1. Inform the user with the **Custom Field Error** template below.
2. Create the bug anyway with the fields that succeed.
3. Add a comment to the created bug noting which field failed and why.
4. As a last-resort fallback for that specific field, embed its value in the Description using the heading from the §1.10.2 table.

**Custom Field Error template** (user-facing):

> ⚠️ Custom field `{FIELD_NAME}` (id `{CUSTOMFIELD_ID}`) could not be set on `{BUG-KEY}`.
> The bug was created without it. Please contact your Jira admin to verify the field id
> for this project, then re-run `bun run jira:sync-fields --force` and `bun run jira:check`.
> If the slug needs to be added to the methodology, update `.agents/jira-required.yaml`.

### 1.11 Attachments

Use absolute paths under the ticket's `evidence/` folder. Supported: `.png`, `.jpg`, `.gif`, `.mp4`, `.log`, `.txt`, `.pdf`. Provide the 1-2 most informative screenshots (the bug state, not navigation screens).

### 1.12 Human confirmation gate

Before calling `[ISSUE_TRACKER_TOOL] Create issue`, present the full draft (title, severity, error type, environment, custom-field summary, attachments list) and wait for user OK. Never skip this gate.

### 1.13 Post-creation

1. Comment on the related story with a back-reference: `Bug found during exploratory testing: {BUG-KEY} - {title}`.
2. Assign if user specifies, otherwise leave for triage.
3. Update the ticket's PBI `context.md` with the new bug key.

---

## 2. Test Report Template (ATR body)

### 2.1 Prerequisites

- All Stage 2 TCs have final status PASSED or FAILED (no NOT RUN).
- Evidence under `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/evidence/`.
- Bugs, if any, already filed per §1.
- TMS modality resolved in Session Start (§0) and persisted in `test-session-memory.md`.

### 2.2 ATR plain-text body

The same body text is used in both modalities; only the container differs (§2.4).

```
{{PROJECT_KEY}}-{number} TEST RESULTS
Tested: {date}
Environment: {Staging | localhost}
Tester: {name/email}
Result: {PASSED | FAILED | PASSED WITH ISSUES} ({passed}/{total})

SUMMARY
  {Brief description of what was tested}
  {Overall outcome statement}

TEST CASES
  TC-{id}: {name} ... {status}
  TC-{id}: {name} ... {status}

TEST DATA
  {Entity}: {name} (ID: {id})

BUGS FOUND
  {None | list with {BUG-KEY} - severity}

OBSERVATIONS
  {Notable findings, edge cases, UX feedback}

RECOMMENDATIONS
  {Automation candidates, future testing, improvements}
```

"Result" values: `PASSED` (all TCs pass), `FAILED` (one or more fail), `PASSED WITH ISSUES` (all pass but with notable observations). The per-TC statuses come from the Execution Status field (Run), not the Test Status workflow — see `test-documentation/references/tms-conventions.md` §IQL.

### 2.3 Upload by modality

Apply the branch that matches the resolved modality (do not mix).

> **Prerequisite (both modalities)**: Load `/acli` skill before any `[ISSUE_TRACKER_TOOL]` call below. In Modality jira-xray additionally load `/xray-cli` for `[TMS_TOOL] Update Run` and `[TMS_TOOL] Import Results`. Skip if Session Start §0.1 in `SKILL.md` already loaded them.

#### Modality jira-xray (ATR = Test Execution)

```
# Update the Test Execution description with the ATR body
[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {ATR_KEY}
  description: {ATR body from §2.2}
  fields:
    Environment: {from body}
    Begin Date: {from body "Tested"}
    End Date:   {now}

# Update Test Runs for each TC that executed in this session
for each {TEST_KEY, result} in run:
  [TMS_TOOL] Update Run:
    execution: {ATR_KEY}
    test:      {TEST_KEY}
    status:    PASS | FAIL | BLOCKED | ABORTED | TODO
    comment:   "{optional note, e.g. bug key if FAIL}"

# Close the Execution
[ISSUE_TRACKER_TOOL] Transition Issue:
  issue: {ATR_KEY}
  transition: done
```

If the run was already imported from CI via `[TMS_TOOL] Import Results`, the Test Runs are already populated — only the description + Environment + Begin/End need the manual update.

#### Modality jira-native (ATR = Story customfield; comment is fallback only)

```
[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {STORY_KEY}
  fields:
    {{jira.acceptance_test_results}}: {ATR body from §2.2}

# Fallback only if {{jira.acceptance_test_results}} is absent in .agents/jira-fields.json:
[ISSUE_TRACKER_TOOL] Add Comment:
  issue: {STORY_KEY}
  body: |
    ## Acceptance Test Results (ATR)
    {ATR body from §2.2}

# Update each TC's Test Status field (Execution Status in Jira-native)
for each {TEST_KEY, result} in run:
  [ISSUE_TRACKER_TOOL] Update Issue:
    issue: {TEST_KEY}
    fields:
      Test Status: PASSED | FAILED | BLOCKED
  [ISSUE_TRACKER_TOOL] Add Comment:
    issue: {TEST_KEY}
    body: "Run {date}: {result}. Env: {env}. Session: {STORY_KEY}"
```

### 2.4 "Mark ATR complete" semantics

| Modality | Completion signal |
|----------|-------------------|
| A (Xray) | Test Execution issue transitioned to `Done`; all Test Runs have terminal status (PASS/FAIL/BLOCKED/ABORTED, not TODO/EXECUTING). |
| B (Jira-native) | `{{jira.acceptance_test_results}}` populated with full body (not placeholder), or the `## Acceptance Test Results (ATR)` fallback comment when the field is absent; every linked TC has a terminal Test Status. |

> **TC body**: the test-case body = the `Test` issue's `description` (synced in both modalities). The Xray Gherkin / Test-Steps plugin field is NOT synced — it only mirrors the description.

### 2.5 Local cache (`acceptance-test-results.md`, from sync)

After the ATR is in Jira, materialize the read-only cache per modality. This is a sync-emitted cache — NEVER hand-write or hand-edit it. Jira is source of truth. (The old hand-written `test-report.md` mirror is retired.)

- **Modality jira-native**: ATR = the Story's `{{jira.acceptance_test_results}}` field (or `## Acceptance Test Results (ATR)` fallback comment). Run `bun run jira:sync-issues get <STORY_KEY> --include-comments` → `acceptance-test-results.md` at `.../stories/STORY-<KEY>-<slug>/acceptance-test-results.md`.
- **Modality jira-xray**: ATR = the **Test Execution** issue's `description`. Run `bun run jira:sync-issues get <ATR_KEY>` → `test-executions/TESTEXEC-<ATR_KEY>-<slug>.md` (the sync supports the Test Execution issue type). Per-TC run results (pass/fail) are NOT synced — read those via `[TMS_TOOL]` (xray-cli).

Also append to `context.md`:

```markdown
## Final Status

**Result:** {PASSED | FAILED | BLOCKED}
**Workflow Complete:** {date}
**Next:** {{{jira.status.story.qa_approved}} | Wait for fixes}
```

### 2.6 Report-to-user summary

Present Total / PASSED / FAILED / Pass Rate % as a 4-row summary when closing the ticket.

---

## 3. QA Comment Templates

Four comment templates cover the two paths (Story, Bug) and two outcomes (pass, fail). Pick by ticket type and result.

### 3.1 Template A — Story PASSED

```
QA Testing Complete - {{PROJECT_KEY}}-{number}

Environment: {Staging | localhost}
Result: PASSED ({passed}/{total} TCs)

TEST DATA USED:
- {Entity type}: {name} (ID: {id})

VERIFIED BEHAVIORS:
- AC1: {brief description} - VERIFIED
- AC2: {brief description} - VERIFIED

{If clarifications obtained:}
CLARIFICATIONS:
- {Brief note}

Artifacts: ATP-{id}, ATR-{id}, TC-{ids}
```

### 3.2 Template B — Story FAILED (confirmed defect)

Use only after AI and user agree the defect is real.

```
QA Testing Complete - {{PROJECT_KEY}}-{number}

Environment: {Staging | localhost}
Result: FAILED ({passed}/{total} TCs)

TEST DATA USED:
- {Entity type}: {name} (ID: {id})

VERIFIED BEHAVIORS:
- AC1: {brief description} - VERIFIED

FAILED VERIFICATION:
- AC3: {brief description} - FAILED
  Expected: {what should happen}
  Actual: {what happened}
  Impact: {user/business impact}

DEFECT: {Bug key and short description}

Artifacts: ATP-{id}, ATR-{id}, TC-{ids}
```

### 3.3 Template C — Bug VERIFIED (retest, fix works)

```
QA Bug Verification - {{PROJECT_KEY}}-{number}

Environment: {Staging | localhost}
Result: VERIFIED - Bug fix confirmed

TEST DATA USED:
- {Entity}: {name} (ID: {id})

VERIFICATION:
- Original bug scenario: No longer reproduces
- Expected behavior: Now works correctly
- Regression check: No issues found

Artifacts: ATP-{id}, ATR-{id}
```

### 3.4 Template D — Bug NOT FIXED

Use only after AI and user agree the bug still reproduces.

```
QA Bug Verification - {{PROJECT_KEY}}-{number}

Environment: {Staging | localhost}
Result: NOT FIXED - Issue persists

TEST DATA USED:
- {Entity}: {name} (ID: {id})

VERIFICATION FAILED:
- Reproduction steps: {steps taken}
- Expected: {what should happen}
- Actual: {what still happens}

Returning to dev for review.

Artifacts: ATP-{id}, ATR-{id}
```

### 3.5 Evidence attachments (after comment)

After posting any Template A-D comment, surface 1-2 screenshot paths so the user can attach them to the TMS comment:

```
Comment posted to TMS.

Evidence screenshots to attach:
1. {abs-path-to-evidence}/{{PROJECT_KEY}}-{number}-{primary}.png — {desc}
2. {abs-path-to-evidence}/{{PROJECT_KEY}}-{number}-{secondary}.png — {desc, if applicable}
```

Rules: pick the most informative 1-2 shots; for bugs show the fix working (Template C) or the persisting failure (Template D); for stories show key ACs verified; never list intermediate navigation shots.

---

## 4. When to write which artifact

| Situation | Bug report | Test report (ATR) | Comment template |
|-----------|-----------|-------------------|------------------|
| Story all TCs PASSED | — | Yes | A |
| Story any TC FAILED | Yes (per failure) | Yes | B |
| Story TC FAILED but recalibrated to non-defect (framework-default/mitigated, §5.0) | Low-priority follow-up only (not a blocker) | Yes (result `PASSED WITH ISSUES`, record gate outcome) | A + recalibration note |
| Bug retest confirms fix | — | Yes (abridged) | C |
| Bug retest reproduces | — | Yes (abridged) | D |
| Triage SKIP (code review only) | — | — | Short code-review note on ticket |
| Regression-only finding mid-exploration | Yes | — (fold into current ticket ATR) | (adds to A/B) |

"Abridged ATR" for bugs = the same plain-text body with `TEST CASES` section omitted (bugs have no TCs, only the bug ticket itself as implicit test case); list the reproduction scenario instead.

---

## 5. Commit-after-Stage-3 semantics

Once Stage 3 closes, the ticket state moves forward and the PBI folder becomes the source of truth for Stages 4, 5 and 6.

### 5.0 Severity recalibration gate (before any blocking transition)

A failing Story TC does NOT mechanically equal a blocking defect. Security, auth, integration and "secure-cookie / header" findings frequently have a framework-default explanation that changes their severity — firing `defect_reported` → `blocked` on one of those over-blocks the Story and burns a fix cycle on a non-defect. Run this gate for any **Story TC FAIL** before choosing the transition in §5.1; it is the Stage-3 Story-TC counterpart of the bug veto/risk tree (`acceptance-test-planning.md` §0.1/§0.2) that runs for bugs at Stage 1.

Apply the gate when the failing TC is **security / auth / framework-default class** (cookie flags, CSP/CORS/HSTS headers, SDK-by-design behavior, token rotation defaults, rate-limit defaults). For an ordinary functional FAIL with no such explanation, skip the gate and take the mechanical path in §5.1.

The verdict step must, before any blocking transition:

1. **State the mitigation hypothesis** if one plausibly applies — e.g. "`Secure`/`HttpOnly` are framework defaults under HSTS preload", "missing CSP is the deploy platform's default and is set at the edge", "session SDK rotates tokens by design". If none applies, say so explicitly.
2. **Cite one verification fact** that supports or refutes the hypothesis — a config line, a response header observed, a framework doc reference, a DB/cookie attribute actually read. One fact, not a paragraph.
3. **Surface to the user** whenever the finding is security/auth/framework-default class. The user (or dev review) confirms the recalibration; QA does not silently downgrade a security finding.

Outcomes:

| Gate result | Verdict | Transition |
|-------------|---------|------------|
| Confirmed real defect (hypothesis refuted or none) | FAILED | mechanical §5.1 path (`defect_reported`/blocked or non-strict, file the bug) |
| Recalibrated to non-defect / low pre-prod debt (hypothesis confirmed + fact cited + user OK) | **GO-with-debt** = `PASSED WITH ISSUES` | NO blocking transition — Story signs off; record the recalibration + cited fact + a follow-up note in the ATR (and, if it is genuine pre-prod debt, file a low-priority follow-up, not a blocker) |

Record the gate outcome (hypothesis, cited fact, decision) in the ATR Observations so the audit trail shows *why* a P1 FAIL did not block.

### 5.1 Actions at close

1. ATR marked complete in TMS via `[TMS_TOOL]`.
2. QA comment posted (Template A, B, C or D) via `[ISSUE_TRACKER_TOOL]`.
3. Evidence screenshots surfaced to the user with absolute paths.
4. Ticket transitioned — Story PASSED -> `{{jira.status.story.qa_approved}}` (via `{{jira.transition.story.qa_sign_off}}`); Bug VERIFIED -> `{{jira.status.bug.closed}}` (via `{{jira.transition.bug.retest_passed}}`); Story FAILED **(run the §5.0 recalibration gate first for any security/auth/framework-default FAIL — a recalibrated finding becomes GO-with-debt and takes the PASSED path, not a blocking transition)** with `{{FORMAL_BLOCKED_GATE}}=true` -> `{{jira.status.story.blocked}}` (via `{{jira.transition.story.defect_reported}}`); Story FAILED non-strict -> left in `{{jira.status.story.in_test}}` with linked bug; Bug NOT FIXED -> left in `{{jira.status.bug.ready_for_qa}}` pending dev. See `sprint-orchestration.md` Briefing 4 Step 5 for the full decision tree.
5. PBI `context.md` updated with `Final Status` block.
6. Commit the synced `acceptance-test-results.md` + `context.md` changes on branch `test/{JIRA_KEY}/{short-desc}`, message `test({JIRA_KEY}): add Stage 3 test report for {brief-title}`. Never push to `main` without user confirmation.
7. For batch-sprint mode, only now is the `SPRINT-{N}-TESTING.md` framework file updated (Stage-3 gate).

### 5.2 Next stage routing

| Result | Next | Skill to load |
|--------|------|---------------|
| Story PASSED with TCs worth automating | Formalize TCs + ROI | `test-documentation` (Stage 4) |
| Story PASSED but all TCs Manual-only | Close, no handoff | — |
| Story FAILED | Wait for fix -> re-run Stage 2 on failed TCs -> repeat Stage 3 | (loop) |
| Bug VERIFIED | Optionally add regression ATC | `test-automation` (Stage 5) |
| Bug NOT FIXED | Return to dev | — |
| Release window near | CI regression suite | `regression-testing` (Stage 6) |

### 5.3 Mixed results

When some TCs pass and others fail, set ATR result to `PASSED WITH ISSUES`. File bugs for the failures. Do not block handoff to Stage 4 — the passing TCs are still eligible for ROI evaluation.

### 5.4 Error handling

| Situation | Action |
|-----------|--------|
| TCs still NOT RUN | Return to Stage 2, do not report yet |
| ATR does not exist in TMS | Stage 1 was skipped — return and run `acceptance-test-planning.md` |
| Cannot update ATR via `[TMS_TOOL]` | Check auth, retry; on persistent failure stop and inform user |
| Custom-field creation error on bug | Create bug without that field, note the failure in a bug comment, inform user to contact Jira admin |
| Ticket cannot transition | Some workflows require specific fields filled; inspect transition screen and complete missing fields |

---

## 6. Pre-flight checklist

- [ ] All Stage 2 TCs have final status PASSED or FAILED
- [ ] Bugs, if any, filed with complete custom fields (§1.10) and human confirmation
- [ ] ATR body written in the §2.2 plain-text format and uploaded via `[TMS_TOOL]` (or to `{{jira.acceptance_test_results}}` / `## Acceptance Test Results (ATR)` fallback comment)
- [ ] Synced ATR cache materialized (not hand-written) — jira-native: `acceptance-test-results.md` via `bun run jira:sync-issues get <STORY_KEY> --include-comments`; jira-xray: `test-executions/TESTEXEC-<ATR_KEY>-<slug>.md` via `bun run jira:sync-issues get <ATR_KEY>` (per-TC run results read via `[TMS_TOOL]`, not synced)
- [ ] Correct QA comment template chosen (A/B/C/D) and posted via `[ISSUE_TRACKER_TOOL]`
- [ ] 1-2 evidence screenshot paths surfaced to the user
- [ ] Ticket transitioned (story PASSED -> `{{jira.status.story.qa_approved}}`; bug VERIFIED -> `{{jira.status.bug.closed}}`)
- [ ] `context.md` updated with Final Status block
- [ ] synced `acceptance-test-results.md` + `context.md` committed on `test/{JIRA_KEY}/{short-desc}` with conventional prefix
- [ ] Batch mode only: `SPRINT-{N}-TESTING.md` framework file updated AFTER the above
- [ ] Next-stage routing identified (`test-documentation` / `test-automation` / `regression-testing`, or none)
