# Reporting Templates (Stage 3)

> **Subagent context**: this file is part of the "Context docs" briefing component for the Stage 3 Reporting subagent (see `sprint-testing/SKILL.md` §Subagent Dispatch Strategy and `sprint-orchestration.md` §"Briefing 4 — Stage 3 Reporting subagent").

Stage 3 Reporting artifacts for in-sprint QA: ATR Test Report body, bug report template, and QA comment templates. Output written into the ticket PBI folder and mirrored to the TMS.

This reference is for manual, in-sprint reporting RIGHT NOW. It does NOT cover Stage 4 formal TMS documentation or ROI scoring (see `test-documentation`), Bug Analysis *planning* variant inside an ATP (see `acceptance-test-planning.md`), or automation review artifacts (see `test-automation`).

> **Before publishing ATR / bug-report / QA comment bodies to Jira rich-text fields**, read `../../agentic-qa-core/references/jira-publishing-gotchas.md` — covers the two ADF conversion gotchas (`md-to-adf` mark collision + MCP batched custom-field rejection) that silently fail HTTP 400.
> **And format for readability** per `../../acli/references/adf-authoring-style.md` — an ATR reads far better as a table (test case → status) with a `[!WARNING]` / `[!ERROR]` panel for blockers than as flat indented prose; steps-to-reproduce read best as an ordered list or table.

---

## 1. Bug Report Template

> **Prerequisite**: Load `/acli` skill before executing any `[ISSUE_TRACKER_TOOL]` call in this section (duplicate search, Create issue, comment back-reference, search fields). Skip if Session Start §0.1 in `SKILL.md` already loaded it.

### 1.0 Classify and frame the report first (Bug vs Defect vs Improvement)

This template files all three sibling types — they share one Jira workflow. Before filing, settle the **upstream decisions** per `agentic-qa-core/references/defect-management-doctrine.md` (the canonical, shared doctrine — do not re-derive it here):

- **Issue type** (Part 1) — classify by the affected **FEATURE's lifecycle stage, not where the problem was found** (you may reproduce on localhost/qa yet the feature is pre-release → Defect):
  - **Bug** — feature already live above Staging (production / superior env, end-user visible) — escaped the sprint gate.
  - **Defect** — feature still pre-release (Staging or below); found during sprint testing — the normal output of in-sprint QA (contained, not escaped).
  - **Improvement** — not a broken AC: an enhancement, or an under-specified / absent AC surfaced by a test-beyond-AC.
  The create call (`--type`) follows this classification — do NOT hardcode `Bug`.
- **Components** (Part 3) — native, MANDATORY: set the affected product module / Epic (must pre-exist in the Jira Components module). The `<COMPONENT>` token in the §1.2 summary is a title string; the native `components` field is set separately.
- **Three-axis parenting** (Part 4) — **parent** the issue to the **QA Defect Management** process epic (`qa.qa_epics.defect_epic`, found-or-created — NEVER a product/dev epic and NEVER the Story); KEEP the **source-Story link** for traceability (§1.13); **components** carries the product area. Keep the three axes separate.
- **QA Assignee** (Part 2) — self-assign, never-overwrite; set per §1.13.
- **Priority** (Part 5.1) — auto-derived from Severity (§1.5), written to native `priority`.

Write mechanics (acli `workitem create --from-json` for create-time customfields + native `components`; REST `PUT` for edits) → doctrine Part 6 + `/acli`.

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

**Attach visual evidence** (screenshot of the failing UI, console capture, repro recording). `![](path)` does NOT embed in Jira — use the bundled helper, which uploads the file and posts it inline as a real image:

```bash
bun .agents/skills/acli/scripts/jira-attach-media.ts {{PROJECT_KEY}}-<bug> ./evidence/repro-step-3.png \
  --caption "Step 3 — validation error not shown" --publish
```

One call per evidence file (the image is embedded as a comment on the bug). Full recipe + when-to-use in `../../acli/references/adf-authoring-style.md` §media. This is the high-value case: a reviewer sees the failing screen inline instead of clicking through to the Attachments panel.

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

Priority is **auto-derived** from Severity by this matrix and written to the **native `priority`** field. Override only with a one-line justification when business urgency diverges from technical severity (e.g. a `Trivial` typo in the landing hero warranting `High`). See `agentic-qa-core/references/defect-management-doctrine.md` Part 5.1.

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

**Evidence file naming (mandatory).** Name every file in `evidence/` as `{KEY}-step{NN}-{action}.{ext}` — `{KEY}` = the ticket key, `step{NN}` = zero-padded step number tying the file to a specific reproduction / test step, `{action}` = short kebab-case description, `{ext}` ∈ `png` · `jpg` · `gif` · `mp4` · `log` · `txt` · `pdf` (plus capture-format extensions such as `har` for network traces). Examples: `UPEX-411-step1-form-validation.png`, `UPEX-101-step3-error-shown.png`, `GX-202-step2-network-trace.har`. The `step{NN}` token lets bug reports (§1.3 Steps to Reproduce) and regression analysis reference each piece of evidence by step.

Shared bucket model (auto-logs vs real evidence vs annotation intermediates), the annotated-image suffix, and the verify-on-disk discipline live in `../../agentic-qa-core/references/evidence-conventions.md` — this section stays authoritative for bug-attachment naming only. When the bug is visual/positional and got a marked-up capture via the `bug-screenshot-annotation` skill, that annotated PNG leads the attachment list ahead of the raw shot.

### 1.12 Human confirmation gate

Before calling `[ISSUE_TRACKER_TOOL] Create issue`, present the full draft (title, severity, error type, environment, custom-field summary, attachments list) and wait for user OK. Never skip this gate.

### 1.13 Post-creation

1. **Create the traceability link — Story `causes` Bug.** The `_RELATED STORIES_` prose in the description (§1.3) is human-readable documentation only; the operational edge is a real Jira issuelink. When the Bug is filed against a Story under test, create:

   ```
   [ISSUE_TRACKER_TOOL] Link Issues:
     linkType: {{jira.link_types.problem_incident.name}}   # Story causes Bug
     # Story is the outward party (causes); Bug is the inward party (is caused by)
     story: {STORY_KEY}
     bug:   {BUG-KEY}
   ```

   Resolve the `problem_incident` link type by slug only, create one edge, then run the mandatory direction check (confirm the Story's outward partner is the Bug under `causes`) — full mechanics in `agentic-qa-core/references/traceability-linking.md` (§2 slug resolution, §4 directionality + verification). Defer the `--out`/`--in` flag handling to `/acli` per `[ISSUE_TRACKER_TOOL]`.
2. Comment on the related story with a back-reference: `Bug found during exploratory testing: {BUG-KEY} - {title}`.
3. **Set QA Assignee = self** (`{{jira.qa_assignee}}`) — the authenticated session user who filed the report (the same identity that becomes `reporter`). **Never-overwrite**: read the current value first; write only if empty, or on an explicit, justified handover. This is the QA owner of the issue and is DISTINCT from the native dev `assignee` (which stays free for dev triage — do NOT set it). Per `agentic-qa-core/references/defect-management-doctrine.md` Part 2; customfield write mechanics (REST `PUT`, read-before-write) → Part 6 + `/acli`.
4. Update the ticket's PBI `context.md` with the new bug key.

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

> **ATR item (excellence default)** — by excellence the ATR is the **Test Execution** issue titled `ATR: {STORY-KEY}: Story Testing` (the Story-level run, named **Story Testing**, runs ONCE per sprint), created in Stage 1 — ALWAYS carrying the Test Environment from `active_env` in `.agents/project.yaml` (no ATR without environment; hard gate: `agentic-qa-core/references/stage-gates.md` §Stage 1) — and parented to the **QA Test Artifacts** epic; its test list is DERIVED from the Story's ATS membership. Stage 3 fills its body + run results below. Bug retests use the Execution `ReTest: {BUG_KEY}: {summary}` (same environment rule) and record the repro Test's run there. The Story custom field (`{{jira.acceptance_test_results}}`) is a **fallback ONLY** when the Test Execution work type is unavailable.

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
- **Modality jira-xray**: ATR = the **Test Execution** issue's `description`. Run `bun run jira:sync-issues get <ATR_KEY>` → `test-executions/ATR-<ATR_KEY>-<slug>.md` (the sync supports the Test Execution issue type). Per-TC run results (pass/fail) are NOT synced — read those via `[TMS_TOOL]` (xray-cli). Filename note: the acronym prefix comes from a conforming ladder title; a Plan or Execution whose title does not follow the grammar keeps the legacy `TESTPLAN-` / `TESTEXEC-` / `RETESTEXEC-` prefix.

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

**Real-link rule (binding).** Any ticket the comment names as a blocker or filed defect — the `DEFECT:` line in Template B, back-references to bugs, blocking-ticket mentions in prose — MUST be a real, clickable link to the issue (Markdown `[KEY: title](browse-URL)` → ADF `link` mark), never a bare plain-text key: plain keys do NOT auto-link in ADF, and an unclickable blocker reference defeats the point of naming it. Mechanics + exceptions: `../../acli/references/adf-authoring-style.md` §Issue links. The traceability issuelink (§1.13, §5.1) is separate and still mandatory — the link mark serves the human reader, the issuelink serves the graph.

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

DEFECT: [{BUG-KEY}: {short description}]({jira-browse-url-of-BUG-KEY})   <- real link, never a bare key (§3 real-link rule)

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

### 3.5 Evidence Handoff (emit at Stage 3 close whenever UI or API evidence exists)

A ranked, captioned shortlist of exactly what belongs on the ticket, emitted in chat after the Template A-D comment posts — **on ANY verdict** (pass, fail, bug, open question): a reader trusts a finding far more when they can see it, UI work especially. It never goes inside the Jira comment body itself.

Format:

```
### Evidence Handoff — evidence for the {KEY} thread
Evidence folder: {absolute path}/evidence/

Recommended (in this order):
1. {file} — {business caption}
2. {file} — {business caption}

Skipped (available, not needed): {smoke shot}, raw console/page logs.

API evidence (paste as a thread reply):       <- only if the API was tested
    GET /api/{endpoint}?{params}
    Authorization: <redacted>
    -> 200 · {proving field}: {value}
```

**Delivery — this repo can auto-embed.** Jira accepts inline images via the bundled helper (§1.3), so after emitting the ranked list, OFFER to publish the recommended images directly onto the target issue (one helper call per file, human confirms first); the human-attaches path stays as fallback for surfaces the helper can't reach. Either way the AI never claims an attachment happened unless the helper call verifiably succeeded.

Rules:

- **Curate ruthlessly — do not dump the folder.** 1-4 shots is typical. Lead with the headline / "money" shot; if a bug got an annotated capture via the `bug-screenshot-annotation` skill, that annotated PNG IS the money shot — rank it first, ahead of the raw capture. Then edge cases / controls. For bugs show the fix working (Template C) or the persisting failure (Template D); for stories show key ACs verified; never list intermediate navigation shots.
- **Captions are business outcomes, not mechanism** — "discount now its own line, total unchanged", NOT "panel screenshot at 1280px".
- **Verify each file exists on disk first** (`ls` the evidence dir) — never recommend a capture a subagent only claimed to take (`../../agentic-qa-core/references/evidence-conventions.md` §3).
- **Skip list, one line** — name the captured-but-not-recommended files so the human knows they were considered, not forgotten.
- **API evidence blocks carry ZERO credentials** — redact `Authorization` / Bearer / cookies / API keys / passwords / session tokens → `<redacted>`; drop any token query-param. Show only what proves the behavior (status + the one field that makes the point).
- **Absolute paths here** (the human may open the OS file browser to drag files); the session-footer consolidated list (`../../agentic-qa-core/references/session-footer-contract.md`) uses repo-relative paths — produce both where both apply.

Naming: files in `evidence/` follow §1.11 (`{KEY}-step{NN}-{action}.{ext}`) or the Stage 2 exploration family; annotated images use the dedicated suffix — full model in `../../agentic-qa-core/references/evidence-conventions.md` §2.

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

"Abridged ATR" for bugs = the same plain-text body with the `TEST CASES` section adapted per modality: **jira-xray** lists the repro `Test`'s run (PASSED/FAILED) recorded in the retest Execution (`ReTest: {BUG_KEY}: {summary}`); **jira-native** omits it and lists the reproduction scenario instead (no TCs in-sprint — the bug ticket itself is the implicit test case).

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
3. Evidence Handoff emitted per §3.5 (ranked + captioned, absolute paths, auto-embed offered via the §1.3 helper).
4. Ticket transitioned — Story PASSED -> `{{jira.status.story.qa_approved}}` (via `{{jira.transition.story.qa_sign_off}}`); Bug VERIFIED -> `{{jira.status.bug.closed}}` (via `{{jira.transition.bug.retest_passed}}`); Story FAILED **(run the §5.0 recalibration gate first for any security/auth/framework-default FAIL — a recalibrated finding becomes GO-with-debt and takes the PASSED path, not a blocking transition)** with `{{FORMAL_BLOCKED_GATE}}=true` -> `{{jira.status.story.blocked}}` (via `{{jira.transition.story.defect_reported}}`); Story FAILED non-strict -> left in `{{jira.status.story.in_test}}` with linked bug; Bug NOT FIXED -> left in `{{jira.status.bug.ready_for_qa}}` pending dev. See `sprint-orchestration.md` Briefing 4 Step 5 for the full decision tree.
5. **Create the blocking traceability link — Story `is blocked by` Bug.** Whenever the `defect_reported` → `blocked` gate fires (`{{FORMAL_BLOCKED_GATE}}=true`), the status transition alone does not record the dependency; create the issuelink so the block gate and coverage consumers can walk it:

   ```
   [ISSUE_TRACKER_TOOL] Link Issues:
     linkType: {{jira.link_types.blocks.name}}   # Bug blocks Story → Story is blocked by Bug
     # The Bug is the outward party (blocks); the Story is the inward party (is blocked by)
     bug:   {BUG-KEY}
     story: {STORY_KEY}
   ```

   Resolve the `blocks` link type by slug only, create one edge, then run the mandatory direction check (confirm the Story's inward partner is the Bug under `is blocked by`) — full mechanics in `agentic-qa-core/references/traceability-linking.md` (§2 slug resolution, §4 directionality + verification, §6 never degrade a `blocks` edge to `relates` silently). Defer `--out`/`--in` flag handling to `/acli` per `[ISSUE_TRACKER_TOOL]`.
6. PBI `context.md` updated with `Final Status` block.
7. Nothing to commit — the ATR is canonical in Jira; the synced `acceptance-test-results.md` is a gitignored cache rebuilt by `bun run jira:sync-issues`, and `context.md` is disposable session output (see `AGENTS.md` §9).
8. For sprint-wide mode, only now is the sprint log appended — one entry in `.session/sprint-testing/sprint-{N}/progress.md` mirrored as one comment on the STP (Stage-3 gate; append-only on both sides).

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
- [ ] Synced ATR cache materialized (not hand-written) — jira-native: `acceptance-test-results.md` via `bun run jira:sync-issues get <STORY_KEY> --include-comments`; jira-xray: `test-executions/ATR-<ATR_KEY>-<slug>.md` via `bun run jira:sync-issues get <ATR_KEY>` (per-TC run results read via `[TMS_TOOL]`, not synced)
- [ ] Correct QA comment template chosen (A/B/C/D) and posted via `[ISSUE_TRACKER_TOOL]`
- [ ] Evidence Handoff emitted (§3.5): ranked 1-4 shots with business captions, skip list, API blocks redacted, files ls-verified; auto-embed offered
- [ ] Blocking/defect ticket mentions in the posted comment are real links, not bare keys (§3 real-link rule)
- [ ] Ticket transitioned (story PASSED -> `{{jira.status.story.qa_approved}}`; bug VERIFIED -> `{{jira.status.bug.closed}}`)
- [ ] `context.md` updated with Final Status block
- [ ] Sprint-wide only: sprint `progress.md` entry appended + mirrored as ONE STP comment AFTER the above
- [ ] Next-stage routing identified (`test-documentation` / `test-automation` / `regression-testing`, or none)

---

## 7. Slack reports with tables (macOS clipboard paste — optional delivery channel)

Slack does NOT render markdown tables, tab-separated text, or `[label](url)` pasted from the composer. It DOES render rich content when the clipboard carries the canonical `public.html` flavor — the same thing copying cells from Google Sheets produces. So when the user asks for a QA report "for Slack", deliver it through the clipboard via the bundled helper `cli/slack-clip.js` (JXA, macOS-only, zero config, zero network — it never talks to the Slack API; the human pastes manually).

**Delivery model: `report = 1 PROSE message + 1 message per TABLE`.**

- **Prose piece** — one HTML file using `<p>`, `<ul><li>`, `<b>/<i>/<u>/<s>/<code>/<a>`. Pastes as one rich message.
- **Table piece** — its OWN paste from a **table-only** HTML file (`<table>…</table>`, nothing before or after). Slack allows one table per message and detects "render as table" from the clean-TSV plain-text flavor the helper derives. Mixing table with prose in one paste flattens the table into a run-on line.

**Flow:**

1. Author each piece as a small HTML file in the session scratchpad. Use entities for non-ASCII (`&#8594;` for →, `&#8212;` for —, `&gt;`); header cells in `<b>`; links as `<a href>`.
2. Run: `osascript -l JavaScript cli/slack-clip.js <piece.html>` — expect `public.html=true plain-text=true`.
3. Tell the user the clipboard is live — paste with Cmd+V before copying anything else. Multi-piece: set → paste → confirm → set the next piece.

**Gotchas the helper already handles:** a trailing newline after `</table>` and blank lines between TSV rows both make Slack silently drop the table (the helper trims + emits clean single-newline rows). **Not viable alternatives** (verified): `pbcopy`/plain-TSV (raw text, no table), AppleScript `«data HTML»` (dynamic UTI Slack ignores), Slack Block Kit (no multi-column table block for channel messages).
