# Reporting Templates (Stage 3)

> This file is part of the "Context docs" briefing component for the Stage 3 Reporting subagent (see `sprint-testing/SKILL.md` §Subagent Dispatch Strategy and `sprint-orchestration.md` §"Briefing 4 — Stage 3 Reporting subagent").

The Stage 3 Reporting artifacts for in-sprint QA: the ATR Test Report body, the bug report template and the QA comment templates. Output is written into the ticket PBI folder and mirrored to the TMS.

It covers manual, in-sprint reporting only. Stage 4 formal TMS documentation and ROI scoring live in `test-documentation`, the Bug Analysis *planning* variant inside an ATP in `acceptance-test-planning.md`, and automation review artifacts in `test-automation`.

> Before publishing ATR, bug report or QA comment bodies to Jira rich-text fields, read `../../agentic-qa-core/references/jira-publishing-gotchas.md`. It covers the two ADF conversion gotchas (`md-to-adf` mark collision and MCP batched custom-field rejection) that fail silently with HTTP 400.
> Format for readability per `../../acli/references/adf-authoring-style.md`. An ATR reads far better as a table (test case, status) with a `[!WARNING]` / `[!ERROR]` panel for blockers than as flat indented prose, and steps to reproduce read best as an ordered list or table.

---

## 1. Bug Report Template

> **Prerequisite**: load the `/acli` skill before any `[ISSUE_TRACKER_TOOL]` call in this section (duplicate search, Create issue, comment back-reference, search fields), unless Session Start §0.1 in `SKILL.md` already loaded it.

### 1.0 Classify and frame the report first (Bug vs Defect vs Improvement)

This template files all three sibling types, which share one Jira workflow. Before filing, settle the upstream decisions per `agentic-qa-core/references/defect-management-doctrine.md`, the canonical shared doctrine (do not re-derive it here):

- Issue type (Part 1): classify by the affected feature's lifecycle stage, not by where the problem was found (you may reproduce on localhost or qa while the feature is still pre-release, which makes it a Defect):
  - Bug: the feature is already live above Staging (production or a superior env, end-user visible), so it escaped the sprint gate.
  - Defect: the feature is still pre-release (Staging or below) and the problem was found during sprint testing. This is the normal output of in-sprint QA (contained, not escaped).
  - Improvement: not a broken AC but an enhancement, or an under-specified or absent AC surfaced by a test-beyond-AC.
  The create call (`--type`) follows this classification; hardcoding `Bug` files defects under the wrong type.
- Components (Part 3): native and mandatory. Set the affected product module or Epic (it must already exist in the Jira Components module). The `<COMPONENT>` token in the §1.2 summary is a title string; the native `components` field is set separately.
- Three-axis parenting (Part 4): parent the issue to the QA Defect Management process epic (`qa.qa_epics.defect_epic`, found or created), never to a product or dev epic and never to the Story. Keep the source-Story link for traceability (§1.13), and let components carry the product area. The three axes stay separate.
- QA Assignee (Part 2): self-assign, never overwrite; set per §1.13.
- Priority (Part 5.1): auto-derived from Severity (§1.5), written to native `priority`.

Write mechanics (acli `workitem create --from-json` for create-time customfields and native `components`; REST `PUT` for edits) are in doctrine Part 6 and `/acli`.

### 1.1 When to file a bug

File a bug when Stage 2 execution reveals a confirmed defect. Before filing:

1. Retest the bug once to confirm reproducibility (UI via `[AUTOMATION_TOOL]`, API via `[API_TOOL]`, data via `[DB_TOOL]`).
2. Confirm with the user. A bug is filed only after explicit human agreement that it is a real defect (gate paths: §1.12).
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

**Attach visual evidence.** The bug's evidence is its evidence page (the `evidence-artifact` skill). Its link goes under `## Evidence`, and the bug keeps one annotated thumbnail in its Description, embedded after the link is written and read back before anyone says it is there:

```bash
bun run evidence build --pack <PBI>/evidence/evidence-pack-<BUG>.json \
  --thumb <PBI>/evidence/evidence-artifact/<BUG>/<BUG>-thumbnail.png
bun run evidence attach --pack <PBI>/evidence/evidence-pack-<BUG>.json
```

`![](path)` does not embed in Jira; `attach` uploads the PNG with the bundled media helper and appends it to the end of the Description (`evidence-artifact/references/workflow.md` §4). Nothing else is attached by hand. Without an evidence page (no pack for this bug), the helper alone posts one image as a comment: `bun .agents/skills/acli/scripts/jira-attach-media.ts {{PROJECT_KEY}}-<bug> <png> --caption "<what it shows>" --publish` (full recipe in `../../acli/references/adf-authoring-style.md` §media). Either way the reviewer sees the failing screen inline instead of clicking through to the Attachments panel.

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

Priority is derived from Severity by this matrix and written to the native `priority` field. Override only with a one-line justification when business urgency diverges from technical severity (for example a `Trivial` typo in the landing hero that warrants `High`). See `agentic-qa-core/references/defect-management-doctrine.md` Part 5.1.

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
| Configuration Error | Env var, feature flag, config |
| Infrastructure Error | Infra / deploy / CI |
| Requirement Error | Spec wrong or ambiguous |
| Working As Designed (WAD) | Not a bug |
| Third-Party Error | Library / framework defect |
| Integration Error | External service failure |
| Data Error | DB corruption, bad migration |

If unknown, set Root Cause Text to a short note such as "API returns 500 - server-side investigation needed".

### 1.9 Labels

Always include `bug` and `exploratory-testing`. Append module or domain labels when relevant (for example `checkout`, `billing`, `api`).

### 1.10 Custom fields

#### 1.10.1 Custom field detection (per project)

Bug custom fields vary by Jira workspace. Before creating a bug, read `.agents/jira-fields.json` once. For each row in the table below:

- If the slug exists in `jira-fields.json`, populate the custom field via `[ISSUE_TRACKER_TOOL] Edit Issue ... --field <id>`. The slug column shows the canonical reference; the linter validates it against `.agents/jira-required.yaml`.
- If the slug does not exist, omit the custom-field write and put the content in the bug's Description as a labeled section, using the headings from the "Description fallback" column.

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

Field format: string fields take a plain string, dropdowns take `{"value": "Option"}`, and optional fields are omitted rather than passed as `null`.

Convention: paragraph-style fields get `## Section` headings (multi-line content); option-style fields get `**Label**: value` inline (single-line content).

#### 1.10.3 Description fallback template

When custom fields are missing, the bug Description follows this structure. Include sections only for the fields that fall back here: if `severity` exists as a custom field but `actual_result` does not, the Description has Steps to Reproduce and `## Actual Result`, with no inline Severity (severity goes to its custom field).

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

1. The slug is missing from `.agents/jira-fields.json`: the methodology declares it in `jira-required.yaml` but the user's Jira workspace has no matching custom field. Use the Description fallback (§1.10.3). This is the documented degradation path, not an error, and it needs no warning beyond a note in the QA comment that the field landed in the Description.
2. The slug exists but the write fails at runtime: the field id resolved, but `[ISSUE_TRACKER_TOOL] Edit Issue` rejected the value (permissions, screen scheme, value validation). Do not discover or guess alternative field IDs. Jira custom-field IDs are tenant-specific, and a guess corrupts data silently.

On a runtime failure:

1. Inform the user with the Custom Field Error template below.
2. Create the bug anyway with the fields that succeed.
3. Add a comment to the created bug noting which field failed and why.
4. As a last-resort fallback for that specific field, embed its value in the Description using the heading from the §1.10.2 table.

Custom Field Error template (user-facing):

> ⚠️ Custom field `{FIELD_NAME}` (id `{CUSTOMFIELD_ID}`) could not be set on `{BUG-KEY}`.
> The bug was created without it. Please contact your Jira admin to verify the field id
> for this project, then re-run `bun run jira:sync-fields --force` and `bun run jira:check`.
> If the slug needs to be added to the methodology, update `.agents/jira-required.yaml`.

### 1.11 Attachments

Use absolute paths under the ticket's `evidence/` folder. Supported: `.png`, `.jpg`, `.gif`, `.mp4`, `.log`, `.txt`, `.pdf`. Provide the 1-2 most informative screenshots (the bug state, not navigation screens).

Evidence file naming is mandatory. Name every file in `evidence/` as `{KEY}-step{NN}-{action}.{ext}`: `{KEY}` is the ticket key, `step{NN}` is the zero-padded step number tying the file to a specific reproduction or test step, `{action}` is a short kebab-case description, and `{ext}` is one of `png`, `jpg`, `gif`, `mp4`, `log`, `txt`, `pdf` (plus capture-format extensions such as `har` for network traces). Examples: `UPEX-411-step1-form-validation.png`, `UPEX-101-step3-error-shown.png`, `GX-202-step2-network-trace.har`. The `step{NN}` token lets bug reports (§1.3 Steps to Reproduce) and regression analysis reference each piece of evidence by step.

The shared bucket model (auto-logs, real evidence, annotation intermediates), the annotated-image suffix and the verify-on-disk discipline live in `../../agentic-qa-core/references/evidence-conventions.md`; this section is authoritative for bug-attachment naming only. When the bug is visual/positional and got a marked-up capture via the `bug-screenshot-annotation` skill, that annotated PNG leads the attachment list ahead of the raw shot.

### 1.12 Human confirmation gate

Before calling `[ISSUE_TRACKER_TOOL] Create issue`, present the full draft (title, severity, error type, environment, custom-field summary, attachments list) and wait for the user's OK. The gate always runs.

The same three paths cover every confirmation in this file (§1.1, §3.2, §3.4, §5.0), per `agentic-qa-core/references/decision-protocol.md`. With a person present, they approve in chat. A supervised worker sends the draft to its conductor, who holds the gate. In a routine with nobody, the delegating brief is the approval source when it covers the decision; without one, save the draft in the PBI folder, file and post nothing, and report.

### 1.13 Post-creation

1. Create the traceability link, Story `causes` Bug. The `_RELATED STORIES_` prose in the description (§1.3) is human-readable documentation only; the operational edge is a real Jira issuelink. When the Bug is filed against a Story under test, create:

   ```
   [ISSUE_TRACKER_TOOL] Link Issues:
     linkType: {{jira.link_types.problem_incident.name}}   # Story causes Bug
     # Story is the outward party (causes); Bug is the inward party (is caused by)
     story: {STORY_KEY}
     bug:   {BUG-KEY}
   ```

   Resolve the `problem_incident` link type by slug only, create one edge, then run the mandatory direction check (confirm the Story's outward partner is the Bug under `causes`) ; full mechanics in `agentic-qa-core/references/traceability-linking.md` (§2 slug resolution, §4 directionality and verification). `--out`/`--in` flag handling belongs to `/acli` per `[ISSUE_TRACKER_TOOL]`.
2. Comment on the related story with a back-reference: `Bug found during exploratory testing: {BUG-KEY} - {title}`.
3. Set QA Assignee to self (`{{jira.qa_assignee}}`), the authenticated session user who filed the report (the same identity that becomes `reporter`). Never overwrite: read the current value first and write only if it is empty, or on an explicit, justified handover. This is the QA owner of the issue and is distinct from the native dev `assignee`, which stays free for dev triage (do not set it). Per `agentic-qa-core/references/defect-management-doctrine.md` Part 2; customfield write mechanics (REST `PUT`, read-before-write) are in Part 6 and `/acli`.
4. Update the ticket's PBI `context.md` with the new bug key.

---

## 2. Test Report Template (ATR body)

### 2.1 Prerequisites

- Every Stage 2 TC is PASSED, FAILED, or NOT RUN with a recorded `DEFERRED (execution)`. An open `BLOCKED` is not reportable (`agentic-qa-core/references/discovery-driven-doctrine.md` §5).
- Evidence under `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/evidence/`.
- Bugs, if any, already filed per §1.
- TMS modality resolved in Session Start (§0) and persisted in `test-session-memory.md`.

### 2.2 ATR plain-text body

The same body text is used in both modalities; only the container differs (§2.4).

```
{{PROJECT_KEY}}-{number} TEST RESULTS
Tested: {date}
Environment: {the environment the cases were observed in (the ATR Test Environment)}
Tester: {name/email}
Result: {PASSED | FAILED | PASSED WITH ISSUES | PASSED WITH DEFERRALS} ({passed}/{total})

SUMMARY
  {Brief description of what was tested}
  {Overall outcome statement}

TEST CASES
  TC-{id}: {name} ... {status}
  TC-{id}: {name} ... {status}

DEFERRED (EXECUTION) CASES
  {None | TC-{id}: DEFERRED (execution) {date} by QA decision: {reason}; follow-up {KEY}}

TEST DATA
  {Entity}: {name} (ID: {id})

BUGS FOUND
  {None | list with {BUG-KEY} - severity}

EVIDENCE HANDOFF
  {the §3.5 block: the evidence page URL, one line per bug page, the ranked deep links}

OBSERVATIONS
  {Notable findings, edge cases, UX feedback}

RECOMMENDATIONS
  {Automation candidates, future testing, improvements}
```

"Result" values: `PASSED` (all TCs pass), `FAILED` (one or more fail), `PASSED WITH ISSUES` (all pass but with notable observations, or a FAIL recalibrated to GO-with-debt per §5.0), `PASSED WITH DEFERRALS` (none FAILED, and every case that did not pass is a recorded `DEFERRED (execution)` listed under DEFERRED (EXECUTION) CASES). The per-TC statuses come from the Execution Status field (Run), not the Test Status workflow — see `test-documentation/references/tms-conventions.md` §IQL.

### 2.3 Upload by modality

Apply the branch that matches the resolved modality, and do not mix them.

> **Prerequisite (both modalities)**: load the `/acli` skill before any `[ISSUE_TRACKER_TOOL]` call below. In Modality jira-xray also load `/xray-cli` for `[TMS_TOOL] Update Run` and `[TMS_TOOL] Import Results`. Skip both if Session Start §0.1 in `SKILL.md` already loaded them.

> **ATR item (excellence default)**: the ATR is the Test Execution issue titled `ATR: {STORY-KEY}: Story Testing`. The Story-level run, named Story Testing, runs once per sprint. It is created in Stage 1, always carrying the Test Environment from `active_env` in `.agents/project.yaml` (no ATR without an environment; hard gate in `agentic-qa-core/references/stage-gates.md` §Stage 1), and parented to the QA Test Artifacts epic. Its test list is derived from the Story's ATS membership. Stage 3 fills its body and run results below. Bug retests use the Execution `ReTest: {BUG_KEY}: {summary}` (same environment rule) and record the repro Test's run there. The Story custom field (`{{jira.acceptance_test_results}}`) is a fallback only, for when the Test Execution work type is unavailable.

#### Modality jira-xray (ATR = Test Execution)

```
# Update the Test Execution description with the ATR body
[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {ATR_KEY}
  description: {ATR body from §2.2}
  fields:
    Environment: {from body — already set at creation from active_env (Stage 1 hard gate); confirm, never blank}
    Begin Date: {from body "Tested"}
    End Date:   {now}

# Update Test Runs for each TC that executed in this session
for each {TEST_KEY, result} in run:
  [TMS_TOOL] Update Run:
    execution: {ATR_KEY}
    test:      {TEST_KEY}
    status:    PASSED | FAILED | TODO | EXECUTING  # this instance's vocabulary; BLOCKED / ABORTED only where defined: §2.4
    comment:   "{optional note, e.g. bug key if FAIL}"

# Close the Execution
[ISSUE_TRACKER_TOOL] Transition Issue:
  issue: {ATR_KEY}
  transition: {{jira.transition.test_execution.complete}}
```

If the run was already imported from CI via `[TMS_TOOL] Import Results`, the Test Runs are already populated, so only the description, Environment and Begin/End need the manual update.

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
      Test Status: PASSED | FAILED | NOT RUN  # NOT RUN carries its DEFERRED (execution) reason in the comment; terminal-set caveat: §2.4
  [ISSUE_TRACKER_TOOL] Add Comment:
    issue: {TEST_KEY}
    body: "Run {date}: {result}. Env: {env}. Session: {STORY_KEY}"  # NOT RUN: append "DEFERRED (execution) {date} by QA decision: {reason}; follow-up {KEY}"
```

### 2.4 "Mark ATR complete" semantics

"Complete" is a transition, not a state of mind. Canon: `agentic-qa-core/references/artifact-lifecycle.md` §1.

| Modality | Completion signal |
|----------|-------------------|
| A (Xray) | Every Test Run at a terminal status (PASS/FAIL/BLOCKED/ABORTED, not TODO/EXECUTING), or left `TODO` with its `DEFERRED (execution)` line in the ATR body, THEN the Test Execution issue transitioned via `{{jira.transition.test_execution.complete}}` to `{{jira.status.test_execution.close}}` (the status is named `Close`, not `Done`). A bug retest closes its `ReTest:` Execution with `{{jira.transition.re_test_execution.complete}}`. The terminal set is whatever THIS instance configures. An unexecuted case is not recorded FAILED, because that would report a defect nobody observed: its run stays `TODO` (or `BLOCKED` where the instance defines it) and the ATR body carries `DEFERRED (execution) <date> by QA decision: <reason>; follow-up <KEY>`. The Execution closes once every non-terminal run carries such a line (see `sprint-orchestration.md` Stage 3 step 3-bis). |
| B (Jira-native) | `{{jira.acceptance_test_results}}` populated with full body (not placeholder), or the `## Acceptance Test Results (ATR)` fallback comment when the field is absent; every linked TC has a terminal Test Status, or stays `NOT RUN` with its `DEFERRED (execution)` line in the ATR. No Execution item exists at this altitude — state that as the N/A. |

Stage 3 closes the ATS and the ATP in the same pass (Modality jira-xray): ATS via `{{jira.transition.test_set.done}}` → `{{jira.status.test_set.close}}` (membership final), ATP via `{{jira.transition.test_plan.complete}}` → `{{jira.status.test_plan.completed}}` (results are in; fire `{{jira.transition.test_plan.designed}}` first if Stage 1 left it at `planning`). On an unmapped slug run the `artifact-lifecycle.md` §4 fallback and ask; a silent skip hides unfinished work.

> **TC body**: the test-case body is the `Test` issue's `description` (synced in both modalities). The Xray Gherkin / Test-Steps plugin field is not synced; it only mirrors the description.

### 2.5 Local cache (`acceptance-test-results.md`, from sync)

After the ATR is in Jira, materialize the read-only cache per modality. The sync emits this cache and Jira is the source of truth, so do not hand-write or hand-edit it.

- Modality jira-native: ATR = the Story's `{{jira.acceptance_test_results}}` field (or `## Acceptance Test Results (ATR)` fallback comment). Run `bun run jira:sync-issues get <STORY_KEY> --include-comments` → `acceptance-test-results.md` at `.../stories/STORY-<KEY>-<slug>/acceptance-test-results.md`.
- Modality jira-xray: ATR = the **Test Execution** issue's `description`. Run `bun run jira:sync-issues get <ATR_KEY>` → `test-executions/ATR-<ATR_KEY>-<slug>.md` (per `work_types.test_execution.sync` in `.agents/jira-required.yaml`). Per-TC run results (pass/fail) are not synced; read those via `[TMS_TOOL]` (xray-cli). Filename note: the acronym prefix comes from a conforming ladder title; a Plan or Execution whose title does not follow the grammar keeps the legacy `TESTPLAN-` / `TESTEXEC-` / `RETESTEXEC-` prefix.

Also append to `context.md`:

```markdown
## Final Status

**Result:** {PASSED | PASSED WITH ISSUES | PASSED WITH DEFERRALS | FAILED}
**Workflow Complete:** {date}
**Next:** {{{jira.status.story.qa_approved}} | Wait for fixes}
```

### 2.6 Report-to-user summary

Present Total / PASSED / FAILED / Pass Rate % as a 4-row summary when closing the ticket.

---

## 3. QA Comment Templates

Four comment templates cover the two paths (Story, Bug) and two outcomes (pass, fail). Pick by ticket type and result.

**Real-link rule.** Any ticket a comment names as a blocker or filed defect (the `DEFECT:` line in Template B, back-references to bugs, blocking-ticket mentions in prose) is a real, clickable link to the issue: Markdown `[KEY: title](browse-URL)`, which becomes an ADF `link` mark. A bare plain-text key does not auto-link in ADF, and an unclickable blocker reference defeats the point of naming it. Mechanics and exceptions: `../../acli/references/adf-authoring-style.md` §Issue links. The traceability issuelink (§1.13, §5.1) is separate and still mandatory: the link mark serves the human reader, the issuelink serves the graph.

### 3.1 Template A — Story PASSED

```
QA Testing Complete - {{PROJECT_KEY}}-{number}

Environment: {the environment the cases were observed in (the ATR Test Environment)}
Result: PASSED ({passed}/{total} TCs)

TEST DATA USED:
- {Entity type}: {name} (ID: {id})

VERIFIED BEHAVIORS:
- AC1: {brief description} - VERIFIED
- AC2: {brief description} - VERIFIED

{If any case was deferred:}
DEFERRED (EXECUTION) CASES (not observed; QA decision, follow-up open):
- TC-{id}: {reason} - follow-up {KEY}

{If clarifications obtained:}
CLARIFICATIONS:
- {Brief note}

Artifacts: ATP-{id}, ATR-{id}, TC-{ids}
```

### 3.2 Template B — Story FAILED (confirmed defect)

Use only after the AI and the user agree the defect is real (gate paths: §1.12).

```
QA Testing Complete - {{PROJECT_KEY}}-{number}

Environment: {the environment the cases were observed in (the ATR Test Environment)}
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

DEFECT: [{BUG-KEY}: {short description}]({jira-browse-url-of-BUG-KEY})   <- real link, never a bare key (§3 real-link rule)

Artifacts: ATP-{id}, ATR-{id}, TC-{ids}
```

### 3.3 Template C — Bug VERIFIED (retest, fix works)

```
QA Bug Verification - {{PROJECT_KEY}}-{number}

Environment: {the environment the cases were observed in (the ATR Test Environment)}
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

Use only after the AI and the user agree the bug still reproduces (gate paths: §1.12).

```
QA Bug Verification - {{PROJECT_KEY}}-{number}

Environment: {the environment the cases were observed in (the ATR Test Environment)}
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

### 3.5 Evidence Handoff (emit at Stage 3 close whenever UI, API or DB evidence exists)

All evidence a reader needs lives on the ticket's evidence page: one private page per story ticket under test and one per bug filed, built from the evidence pack the session wrote during Stage 2 (annotated screenshots, expected vs actual, API requests, SQL results). The `evidence-artifact` skill owns it. Build and publish per its `references/workflow.md` §3 before composing this handoff, so every line below carries a real URL. The handoff is produced whenever evidence exists, on any verdict (pass, fail, bug, open question).

This block is for the human (printed in chat) and is also the ATR's one evidence list: it goes into the ATR body as its `EVIDENCE HANDOFF` section in the same update that marks the ATR complete (§2). The ATR carries no second list. The QA comment carries only the page link, in its footer (`Evidence → [evidence page](<url>)`), and each TC's notes get their own deep link (`evidence-artifact/references/workflow.md` §3 step 6). The tracker keeps one image per bug, the thumbnail in the bug's Description (§1.3); nothing else is attached by hand.

What to emit:

1. Evidence pages: the ticket's page URL, then one line per bug page (`{BUG} — {title} — <url>`), plus the owner line "Published private: share it from the page's Share menu."
2. What the page proves, ranked: 1-4 lines, each a business caption naming its case, with the case's deep link (`<url>#{KEY}.{TC}`). The headline proof comes first, then edge cases and controls.
3. Local pack: the absolute path of `evidence/evidence-pack.json` and the screenshot folder, for the operator on this machine. It never goes in the tracker.

Format (chat + the `EVIDENCE HANDOFF` section of the ATR):

```
### Evidence Handoff — {KEY}
Evidence page: <url>   (published private; share it from the page's Share menu)
Bug pages: {BUG} — {title} — <url>

What it proves:
1. {TC} — {business caption} — <url>#{KEY}.{TC}
2. {TC} — {business caption} — <url>#{KEY}.{TC}

Local pack: {absolute path}/evidence/evidence-pack.json (screenshots beside it)
```

When the page could not be published (the Artifact tool is unavailable in the session, or the build stopped and named the field): say so in the handoff (and in the mailbox for a fleet worker). The conductor publishes from the pack (`evidence-artifact/references/workflow.md` §3). Until then the handoff lists the ranked screenshot files by absolute path with the same captions, `ls`-verified, and the ATR line says the page is pending; replace it once the URL exists.

Rules:

- Emit it whenever UI, API or DB evidence exists, whatever the verdict.
- Captions are business outcomes, not mechanism: "discount now its own line, total unchanged", not "panel screenshot at 1280px".
- Verify each file exists on disk first (`ls` the evidence dir). A capture a subagent only claimed to take is not cited (`../../agentic-qa-core/references/evidence-conventions.md` §3).
- The page holds the API and SQL proof, credentials redacted when the pack was written (`evidence-artifact/references/privacy.md`); the handoff does not repeat request blocks.
- A link is the published page URL; the comment carries no local path.
- The AI says the page was published private and does not claim the owner shared it.
- Do not hand over or embed a Playwright trace, HAR or raw network dump in the tracker, a PR or an evidence page: a trace bundles every network response the run captured, including unrelated data. Traces stay on the machine, gitignored, for local debugging.

Naming: files in `evidence/` follow §1.11 (`{KEY}-step{NN}-{action}.{ext}`) or the Stage 2 exploration family; annotated images use the dedicated suffix (full model in `../../agentic-qa-core/references/evidence-conventions.md` §2).

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

An abridged ATR for a bug is the same plain-text body with the `TEST CASES` section adapted per modality: jira-xray lists the repro `Test`'s run (PASSED/FAILED) recorded in the retest Execution (`ReTest: {BUG_KEY}: {summary}`); jira-native omits it and lists the reproduction scenario instead (no TCs in-sprint; the bug ticket itself is the implicit test case).

---

## 5. Commit-after-Stage-3 semantics

Once Stage 3 closes, the ticket state moves forward and the PBI folder becomes the source of truth for Stages 4, 5 and 6.

### 5.0 Severity recalibration gate (before any blocking transition)

A failing Story TC does not automatically mean a blocking defect. Security, auth, integration and "secure-cookie / header" findings often have a framework-default explanation that changes their severity, and firing `defect_reported` → `blocked` on one of those over-blocks the Story and burns a fix cycle on a non-defect. Run this gate for any Story TC FAIL before choosing the transition in §5.1. It is the Stage-3 Story-TC counterpart of the bug veto/risk tree (`acceptance-test-planning.md` §0.1/§0.2) that runs for bugs at Stage 1.

Apply the gate when the failing TC is of the security, auth or framework-default class (cookie flags, CSP/CORS/HSTS headers, SDK-by-design behavior, token rotation defaults, rate-limit defaults). For an ordinary functional FAIL with no such explanation, skip the gate and take the mechanical path in §5.1.

Before any blocking transition, the verdict step does three things:

1. State the mitigation hypothesis if one plausibly applies, for example "`Secure`/`HttpOnly` are framework defaults under HSTS preload", "missing CSP is the deploy platform's default and is set at the edge", "session SDK rotates tokens by design". If none applies, say so explicitly.
2. Cite one verification fact that supports or refutes the hypothesis: a config line, a response header observed, a framework doc reference, a DB/cookie attribute actually read. One fact, not a paragraph.
3. Surface it to the user whenever the finding is of the security, auth or framework-default class. The user (or dev review) confirms the recalibration, because QA does not silently downgrade a security finding. Gate paths: §1.12; a routine with no covering brief makes no blocking transition and reports the open hypothesis.

Outcomes:

| Gate result | Verdict | Transition |
|-------------|---------|------------|
| Confirmed real defect (hypothesis refuted or none) | FAILED | mechanical §5.1 path (`defect_reported`/blocked or non-strict, file the bug) |
| Recalibrated to non-defect / low pre-prod debt (hypothesis confirmed + fact cited + user OK) | **GO-with-debt** = `PASSED WITH ISSUES` | No blocking transition; Story signs off; record the recalibration + cited fact + a follow-up note in the ATR (and, if it is genuine pre-prod debt, file a low-priority follow-up, not a blocker) |

Record the gate outcome (hypothesis, cited fact, decision) in the ATR Observations so the audit trail shows why a P1 FAIL did not block.

### 5.1 Actions at close

1. ATR marked complete in TMS via `[TMS_TOOL]`, then transitioned to `{{jira.status.test_execution.close}}` per §2.4, together with the ATS (→ `{{jira.status.test_set.close}}`) and the ATP (→ `{{jira.status.test_plan.completed}}`). Leaving any of the three where `create` dropped it fails the Reporting DoD (sprint-testing anti-pattern S18).
2. QA comment posted (Template A, B, C or D) via `[ISSUE_TRACKER_TOOL]`.
3. Evidence Handoff emitted per §3.5 (the page URLs, ranked deep links, the local pack; the same block is the ATR's evidence section).
4. Ticket transitioned: Story PASSED (every case PASSED, or `DEFERRED (execution)` listed in the QA comment for the signer) -> `{{jira.status.story.qa_approved}}` (via `{{jira.transition.story.qa_sign_off}}`); Bug VERIFIED -> `{{jira.status.bug.closed}}` (via `{{jira.transition.bug.retest_passed}}`); Story FAILED (run the §5.0 recalibration gate first for any security, auth or framework-default FAIL: a recalibrated finding becomes GO-with-debt and takes the PASSED path, not a blocking transition) with `{{FORMAL_BLOCKED_GATE}}=true` -> `{{jira.status.story.blocked}}` (via `{{jira.transition.story.defect_reported}}`); Story FAILED non-strict -> left in `{{jira.status.story.in_test}}` with linked bug; Bug NOT FIXED -> left in `{{jira.status.bug.ready_for_qa}}` pending dev. See `sprint-orchestration.md` Briefing 4 Step 5 for the full decision tree.
5. Create the blocking traceability link, Story `is blocked by` Bug. Whenever the `defect_reported` → `blocked` gate fires (`{{FORMAL_BLOCKED_GATE}}=true`), the status transition alone does not record the dependency; create the issuelink so the block gate and coverage consumers can walk it:

   ```
   [ISSUE_TRACKER_TOOL] Link Issues:
     linkType: {{jira.link_types.blocks.name}}   # Bug blocks Story → Story is blocked by Bug
     # The Bug is the outward party (blocks); the Story is the inward party (is blocked by)
     bug:   {BUG-KEY}
     story: {STORY_KEY}
   ```

   Resolve the `blocks` link type by slug only, create one edge, then run the mandatory direction check (confirm the Story's inward partner is the Bug under `is blocked by`) ; full mechanics in `agentic-qa-core/references/traceability-linking.md` (§2 slug resolution, §4 directionality and verification, §6 on why a `blocks` edge is not silently degraded to `relates`). `--out`/`--in` flag handling belongs to `/acli` per `[ISSUE_TRACKER_TOOL]`.
6. PBI `context.md` updated with `Final Status` block.
7. Nothing to commit: the ATR is canonical in Jira; the synced `acceptance-test-results.md` is a gitignored cache rebuilt by `bun run jira:sync-issues`, and `context.md` is disposable session output (see `.agents/instructions/agent-local-context-pbi.md`).
8. For sprint-wide mode, the sprint log is appended only now: one entry in `.session/sprint-testing/sprint-{N}/progress.md` mirrored as one comment on the STP (Stage-3 gate; append-only on both sides).

### 5.2 Next stage routing

| Result | Next | Skill to load |
|--------|------|---------------|
| Story PASSED with TCs worth automating | Formalize TCs + ROI | `test-documentation` (Stage 4) |
| Story PASSED but all TCs Manual-only | Close, no handoff | — |
| Story FAILED | Wait for fix -> re-run Stage 2 on failed TCs -> repeat Stage 3 | (loop) |
| Bug VERIFIED | Bug-driven decision (golden rule + ROI + the person's signature), then automate a signed Candidate | `test-documentation` (Stage 4), then `test-automation` (Stage 5) |
| Bug NOT FIXED | Return to dev | — |
| Release window near | CI regression suite | `regression-testing` (Stage 6) |

### 5.3 Mixed results

When some TCs pass and others fail, set the ATR result to `FAILED` (one or more fail, per the §2.2 "Result" values); `PASSED WITH ISSUES` is only for a FAIL recalibrated per §5.0. File bugs for the failures. Handoff to Stage 4 stays open, since the passing TCs are still eligible for ROI evaluation.

### 5.4 Error handling

| Situation | Action |
|-----------|--------|
| TCs NOT RUN without a recorded deferral | Run the blocking ladder (`agentic-qa-core/references/discovery-driven-doctrine.md` §5); do not report yet |
| ATR does not exist in TMS | Stage 1 was skipped — return and run `acceptance-test-planning.md` |
| Cannot update ATR via `[TMS_TOOL]` | Check auth, retry; on persistent failure stop and inform user |
| Custom-field creation error on bug | Create bug without that field, note the failure in a bug comment, inform user to contact Jira admin |
| Ticket cannot transition | Some workflows require specific fields filled; inspect transition screen and complete missing fields |

---

## 6. Pre-flight checklist

- [ ] Every Stage 2 TC is PASSED / FAILED on observation, or NOT RUN with a recorded `DEFERRED (execution)`; no open `BLOCKED`
- [ ] Bugs, if any, filed with complete custom fields (§1.10) and human confirmation
- [ ] ATR body written in the §2.2 format and uploaded via `[TMS_TOOL]` (or to `{{jira.acceptance_test_results}}` / the `## Acceptance Test Results (ATR)` fallback comment), and the synced cache materialized by `bun run jira:sync-issues`, not hand-written (§2.5)
- [ ] Correct QA comment template (A/B/C/D) posted via `[ISSUE_TRACKER_TOOL]`, with real links for blocker or defect tickets (§3)
- [ ] Evidence Handoff emitted (§3.5) and written as the ATR's `EVIDENCE HANDOFF` section; each bug's one thumbnail embedded with `bun run evidence attach` and read back
- [ ] Ticket transitioned (story PASSED -> `{{jira.status.story.qa_approved}}`; bug VERIFIED -> `{{jira.status.bug.closed}}`) and `context.md` updated with the Final Status block
- [ ] Sprint-wide only: sprint `progress.md` entry appended and mirrored as one STP comment after the above
- [ ] Next-stage routing identified (`test-documentation` / `test-automation` / `regression-testing`, or none)

---

## 7. Slack reports with tables (macOS clipboard paste — optional delivery channel)

Slack does not render markdown tables, tab-separated text, or `[label](url)` pasted from the composer. It does render rich content when the clipboard carries the canonical `public.html` flavor (what copying cells from Google Sheets produces). So when the user asks for a QA report "for Slack", deliver it through the clipboard via the bundled helper `cli/slack-clip.js` (JXA, macOS-only, no config, no network: it never talks to the Slack API and the human pastes manually).

Delivery model: `report = 1 PROSE message + 1 message per TABLE`.

- Prose piece: one HTML file using `<p>`, `<ul><li>`, `<b>/<i>/<u>/<s>/<code>/<a>`. Pastes as one rich message.
- Table piece: its own paste from a **table-only** HTML file (`<table>…</table>`, nothing before or after). Slack allows one table per message and detects "render as table" from the clean-TSV plain-text flavor the helper derives. Mixing table with prose in one paste flattens the table into a run-on line.

Flow:

1. Author each piece as a small HTML file in the session scratchpad. Use entities for non-ASCII (`&#8594;` for →, `&#8212;` for —, `&gt;`); header cells in `<b>`; links as `<a href>`.
2. Run: `osascript -l JavaScript cli/slack-clip.js <piece.html>` — expect `public.html=true plain-text=true`.
3. Tell the user the clipboard is live and to paste with Cmd+V before copying anything else. Multi-piece: set → paste → confirm → set the next piece.

The helper already handles two gotchas: a trailing newline after `</table>` and blank lines between TSV rows both make Slack silently drop the table, so the helper trims and emits clean single-newline rows. Alternatives that do not work: `pbcopy` or plain TSV (raw text, no table), AppleScript `«data HTML»` (a dynamic UTI Slack ignores), and Slack Block Kit (no multi-column table block for channel messages).
