# Reporting Templates (Stage 3)

Stage 3 Reporting artifacts for in-sprint QA: ATR Test Report body, bug report template, and QA comment templates. Output written into the ticket PBI folder and mirrored to the TMS.

This reference is for manual, in-sprint reporting RIGHT NOW. It does NOT cover Stage 4 formal TMS documentation or ROI scoring (see `test-documentation`), Bug Analysis *planning* variant inside an ATP (see `acceptance-test-planning.md`), or automation review artifacts (see `test-automation`).

---

## 1. Bug Report Template

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
| Working As Designed | Not a bug |
| Third-Party Error | Library / framework defect |
| Integration Error | External service failure |
| Data Error | DB corruption, bad migration |

If unknown, set Root Cause Text to a short note such as "API returns 500 - server-side investigation needed".

### 1.9 Labels

Always include: `bug`, `exploratory-testing`. Append module or domain labels when relevant (e.g. `checkout`, `billing`, `api`).

### 1.10 Custom fields (UPEX Galaxy workspace)

| Field | ID | Type | Notes |
|-------|-----|------|-------|
| Actual Result | `customfield_10109` | Textarea | What actually happened |
| Expected Result | `customfield_10110` | Textarea | What should have happened |
| Error Type | `customfield_10112` | Dropdown | Functional / Visual / Content / Performance / Crash / Data / Integration / Security |
| SEVERITY | `customfield_10116` | Dropdown | Critical / Major / Moderate / Minor / Trivial |
| Test Environment | `customfield_12210` | Dropdown | Dev / QA / UAT / Staging / Production |
| Root Cause | `customfield_10701` | Dropdown | Values above |
| Root Cause Text | `customfield_10049` | Textarea | Technical analysis |
| Workaround | `customfield_10111` | Textarea | Optional — omit if none |
| Evidence | `customfield_10607` | Textarea | Optional — omit if using attachments |
| Fix | `customfield_12212` | Dropdown | `Bugfix` (default) or `Hotfix` |

**Field format rules:** string fields pass a plain string; dropdowns pass `{"value": "Option"}`; omit optional fields (do not pass `null`).

**Non-UPEX workspaces:** try `[ISSUE_TRACKER_TOOL] Search fields` with the field name as keyword. If no equivalent exists, ask the user for the correct ID, or as last resort embed the values in the Description under a `_ADDITIONAL FIELDS_` block and note which fields are missing.

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
- Evidence under `.context/PBI/{module}/{ticket}/evidence/`.
- Bugs, if any, already filed per §1.

### 2.2 ATR plain-text body

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

Upload via `[TMS_TOOL]` and mark ATR complete.

### 2.3 Local mirror (`test-report.md`)

Write a Markdown mirror of the ATR body at `.context/PBI/{module}/{ticket}/test-report.md`. Use H2 sections for Summary / Test Cases (table: TC ID / Name / Status) / Findings / Test Data Used (table: Purpose / Entity / ID) / Evidence (bulleted relative paths). Header lines for Date / Environment / Result ({PASSED | FAILED | BLOCKED} ({X}/{Y})). Content must match the §2.2 body field-for-field.

Also append to `context.md`:

```markdown
## Final Status

**Result:** {PASSED | FAILED | BLOCKED}
**Workflow Complete:** {date}
**Next:** {Tested | Wait for fixes}
```

### 2.4 Report-to-user summary

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
| Bug retest confirms fix | — | Yes (abridged) | C |
| Bug retest reproduces | — | Yes (abridged) | D |
| Triage SKIP (code review only) | — | — | Short code-review note on ticket |
| Regression-only finding mid-exploration | Yes | — (fold into current ticket ATR) | (adds to A/B) |

"Abridged ATR" for bugs = the same plain-text body with `TEST CASES` section omitted (bugs have no TCs, only the bug ticket itself as implicit test case); list the reproduction scenario instead.

---

## 5. Commit-after-Stage-3 semantics

Once Stage 3 closes, the ticket state moves forward and the PBI folder becomes the source of truth for Stages 4, 5 and 6.

### 5.1 Actions at close

1. ATR marked complete in TMS via `[TMS_TOOL]`.
2. QA comment posted (Template A, B, C or D) via `[ISSUE_TRACKER_TOOL]`.
3. Evidence screenshots surfaced to the user with absolute paths.
4. Ticket transitioned — Story PASSED or Bug VERIFIED -> `Tested`; Story FAILED or Bug NOT FIXED -> left in current status pending dev.
5. PBI `context.md` updated with `Final Status` block.
6. Commit `test-report.md` + `context.md` changes on branch `test/{JIRA_KEY}/{short-desc}`, message `test({JIRA_KEY}): add Stage 3 test report for {brief-title}`. Never push to `main` without user confirmation.
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
- [ ] ATR body written in the §2.2 plain-text format and uploaded via `[TMS_TOOL]`
- [ ] Local `test-report.md` mirrors the ATR exactly
- [ ] Correct QA comment template chosen (A/B/C/D) and posted via `[ISSUE_TRACKER_TOOL]`
- [ ] 1-2 evidence screenshot paths surfaced to the user
- [ ] Ticket transitioned (`Tested` if PASSED / VERIFIED)
- [ ] `context.md` updated with Final Status block
- [ ] `test-report.md` + `context.md` committed on `test/{JIRA_KEY}/{short-desc}` with conventional prefix
- [ ] Batch mode only: `SPRINT-{N}-TESTING.md` framework file updated AFTER the above
- [ ] Next-stage routing identified (`test-documentation` / `test-automation` / `regression-testing`, or none)
