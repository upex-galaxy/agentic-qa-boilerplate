# Regression Report

> **Phase**: 3 of 3 (Execution → Analysis → Report)
> **Purpose**: Generate stakeholder-ready quality report with GO/NO-GO decision.
> **Output**: Quality report, created issues, TMS updates, recommendations.

---

## Context Loading

**Load these files for reference:**

1. Analysis output from `regression-analysis.md` (Phase 2)
2. `.context/test-management-system.md` → TMS sync configuration
3. Project context (release version, sprint, deployment target)

---

## Input Required

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ REPORT PARAMETERS                                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ Analysis:        [Output from regression-analysis.md] (required)            │
│                                                                             │
│ Release Context:                                                            │
│ ─────────────────────────────────────────────────────────────────────────  │
│ Version:         _________________________________ (e.g., v2.3.0)          │
│ Sprint:          _________________________________ (e.g., Sprint 15)       │
│ Deploy Target:   ○ Production    ○ Staging    ○ QA                        │
│ Deploy Date:     _________________________________ (e.g., 2026-02-12)      │
│                                                                             │
│ Options:                                                                    │
│ ─────────────────────────────────────────────────────────────────────────  │
│ Create Issues:   ○ Yes (for regressions)    ○ No                          │
│ Update TMS:      ○ Yes (if configured)      ○ No                          │
│ Notify Team:     ○ Yes (if Slack configured) ○ No                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Report Generation Workflow

### Step 1: Validate Analysis Input

Ensure the analysis from Phase 2 contains:

- [ ] Execution metrics (total, passed, failed, pass rate)
- [ ] Failure classification (REGRESSION, FLAKY, KNOWN, ENVIRONMENT)
- [ ] Job summary
- [ ] Preliminary recommendation

---

### Step 2: Calculate GO/NO-GO Decision

#### Decision Criteria

| Criterion | GO | CAUTION | NO-GO |
|-----------|-----|---------|-------|
| Pass Rate | ≥ 95% | 90-95% | < 90% |
| Regressions | 0 | 1-2 Low impact | Any High/Critical |
| Critical Tests | All pass | - | Any fail |
| Flaky Tests | ≤ 3 | 4-5 | > 5 |
| Environment Issues | 0 | 1-2 | Persistent |

#### Scoring Matrix

```
                    SCORE CALCULATION
┌─────────────────────────────────────────────────────┐
│                                                     │
│   Pass Rate Score:                                  │
│   ├─ ≥ 95%  = +3                                   │
│   ├─ 90-95% = +1                                   │
│   └─ < 90%  = -2                                   │
│                                                     │
│   Regression Score:                                 │
│   ├─ 0 regressions     = +3                        │
│   ├─ 1-2 Low impact    = +1                        │
│   ├─ 1+ Medium impact  = -1                        │
│   └─ Any High/Critical = -3                        │
│                                                     │
│   Critical Tests Score:                             │
│   ├─ All pass = +2                                 │
│   └─ Any fail = -3                                 │
│                                                     │
│   Flaky Score:                                      │
│   ├─ ≤ 3 flaky = +1                                │
│   ├─ 4-5 flaky = 0                                 │
│   └─ > 5 flaky = -1                                │
│                                                     │
│   TOTAL: ___ / 9                                   │
│                                                     │
│   Decision:                                         │
│   ├─ Score ≥ 7  → GO                               │
│   ├─ Score 4-6  → CAUTION (manual review)          │
│   └─ Score < 4  → NO-GO                            │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

### Step 3: Create Issues for Regressions

If `Create Issues = Yes` and regressions were found:

```bash
# For each regression, create a GitHub issue
gh issue create \
  --title "[REGRESSION] {test_name} failing in {suite}" \
  --body "$(cat <<EOF
## Regression Details

- **Test ID**: {atc_id}
- **Test Name**: {test_name}
- **Suite**: {suite}
- **Run ID**: {run_id}
- **Environment**: {environment}

## Error

\`\`\`
{error_message}
\`\`\`

## Evidence

- [GitHub Actions Run]({run_url})
- [Allure Report]({allure_url})

## Last Passed

- **Date**: {last_pass_date}
- **Run**: #{last_pass_run}

## Impact

{impact_description}

## Suggested Investigation

1. Check recent commits affecting {affected_area}
2. Review element selectors/API contracts
3. Verify test data availability

---
_Auto-generated by Regression Pipeline_
EOF
)" \
  --label "regression,bug,automated-tests" \
  --assignee "{assignee}"
```

Store created issue numbers for the report.

---

### Step 4: Update TMS (Optional)

If TMS sync is configured in `.context/test-management-system.md`:

#### For Xray Integration

```bash
# Update test execution status
# This would use Xray CLI or API - placeholder for actual implementation

# Example structure:
# POST /api/v2/import/execution
# {
#   "testExecutionKey": "PROJ-123",
#   "tests": [
#     { "testKey": "AUTH-001", "status": "PASSED" },
#     { "testKey": "AUTH-002", "status": "FAILED", "comment": "..." }
#   ]
# }
```

#### For Atlassian MCP (if available)

Use `mcp__atlassian__*` tools to update test execution in Jira/Xray.

---

### Step 5: Generate Quality Report

Create the final stakeholder report:

---

## Quality Report Template

```markdown
# Regression Quality Report

---

## Header

| Attribute | Value |
|-----------|-------|
| **Report Date** | {date} |
| **Environment** | {environment} |
| **Version** | {version} |
| **Sprint** | {sprint} |
| **Run ID** | [{run_id}]({run_url}) |
| **Triggered By** | {actor} |
| **Report Generated By** | AI Assistant |

---

## Executive Summary

### Verdict: {verdict_icon} {GO / CAUTION / NO-GO}

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Pass Rate | {pass_rate}% | ≥ 95% | {status_icon} |
| Regressions | {count} | 0 | {status_icon} |
| Critical Failures | {count} | 0 | {status_icon} |
| Flaky Tests | {count} | ≤ 3 | {status_icon} |
| Test Duration | {duration} | ≤ 30m | {status_icon} |

### Decision Rationale

{detailed_explanation_of_decision}

---

## Test Results Overview

### By Category

```
┌────────────────────────────────────────────────────────────┐
│                    TEST RESULTS                            │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Passed:    ████████████████████████████████████  {n} ✅   │
│  Failed:    ████                                  {n} ❌   │
│  Skipped:   ██                                    {n} ⏭️   │
│  Broken:    █                                     {n} 💔   │
│                                                            │
│  Total: {total} tests | Pass Rate: {rate}%                │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### By Test Type

| Type | Total | Passed | Failed | Pass Rate |
|------|-------|--------|--------|-----------|
| Integration (API) | {n} | {n} | {n} | {rate}% |
| E2E (Browser) | {n} | {n} | {n} | {rate}% |

### By Suite

| Suite | Total | Passed | Failed | Status |
|-------|-------|--------|--------|--------|
| Auth | {n} | {n} | {n} | {status} |
| Booking | {n} | {n} | {n} | {status} |
| ... | | | | |

---

## Release Blockers

{if NO-GO or CAUTION, list blockers}

### Critical Issues

| # | Test | Impact | Issue | Owner |
|---|------|--------|-------|-------|
| 1 | {test_name} | {HIGH/CRITICAL} | [{PROJ-XXX}]({url}) | {owner} |
| 2 | {test_name} | {impact} | [{PROJ-XXX}]({url}) | {owner} |

### Required Actions Before Release

1. **{action_1}** - {owner} - ETA: {date}
2. **{action_2}** - {owner} - ETA: {date}

---

## Failure Details

### Regressions ({count})

{for each regression}

#### {regression_number}. {test_name}

| Attribute | Value |
|-----------|-------|
| Test ID | {atc_id} |
| Suite | {suite} |
| Last Passed | {date} (Run #{run}) |
| Impact | {severity} |
| Issue | [{PROJ-XXX}]({url}) |

**Error:**
```
{error_message}
```

**Probable Cause:** {analysis_of_error}

**Screenshot:** [View Evidence]({screenshot_url})

---

### Known Issues ({count})

| Test | Test ID | Ticket | Status | Expected Fix |
|------|---------|--------|--------|--------------|
| {name} | {id} | [{PROJ-XXX}]({url}) | {status} | {date} |

---

### Flaky Tests ({count})

| Test | Test ID | Failure Rate | Action |
|------|---------|--------------|--------|
| {name} | {id} | {rate}% | {stabilization_ticket} |

**Recommendation:** Schedule stabilization in next sprint.

---

### Environment Issues ({count})

| Test | Error | Resolution |
|------|-------|------------|
| {name} | {error_type} | {action_taken} |

---

## Trend Analysis

### Pass Rate Trend (Last 5 Runs)

```
100% │
 95% │────────────────────────────  Target
 90% │    ●───●       ●
 85% │        ╲     ╱
 80% │         ●───●
     └────────────────────────────
       Run  Run  Run  Run  Current
       -4   -3   -2   -1
```

| Run | Date | Pass Rate | Delta |
|-----|------|-----------|-------|
| Current | {date} | {rate}% | - |
| Previous | {date} | {rate}% | {delta}% |
| ... | | | |

---

## Recommendations

### Immediate (Pre-Release)

1. {recommendation_1}
2. {recommendation_2}

### Short-Term (This Sprint)

1. {recommendation_1}
2. {recommendation_2}

### Long-Term (Tech Debt)

1. {recommendation_1}
2. {recommendation_2}

---

## Test Coverage Notes

### Well-Covered Areas

- {area_1}: {coverage_note}
- {area_2}: {coverage_note}

### Coverage Gaps Identified

- {gap_1}: {recommendation}
- {gap_2}: {recommendation}

---

## Links & Resources

| Resource | URL |
|----------|-----|
| GitHub Actions Run | [{run_id}]({run_url}) |
| Allure Report | [View Report]({allure_url}) |
| Playwright Report | [View Report]({playwright_url}) |
| Created Issues | [View Issues]({issues_url}) |
| TMS Execution | [{execution_key}]({tms_url}) |

---

## Appendix

### A. All Failed Tests

<details>
<summary>Click to expand full failure list</summary>

| # | Test Name | Test ID | Category | Error |
|---|-----------|---------|----------|-------|
| 1 | {name} | {id} | {category} | {error} |
| 2 | {name} | {id} | {category} | {error} |
| ... | | | | |

</details>

### B. Run Configuration

| Setting | Value |
|---------|-------|
| Workflow | {workflow_name} |
| Environment | {environment} |
| Browser | Chromium (headless) |
| Parallel Workers | {workers} |
| Video Recording | {enabled/disabled} |

### C. Test Environment

| Component | Version/Details |
|-----------|----------------|
| Node.js | {version} |
| Bun | {version} |
| Playwright | {version} |
| OS | Ubuntu Latest |

---

**Report Generated:** {timestamp}
**Next Scheduled Run:** {next_run_time}

---

_This report was generated automatically by the Regression Pipeline._
_For questions, contact the QA team or review the [Regression Documentation]({docs_url})._
```

---

## Report Actions

### Save Report

```bash
# Write report to file
# The report will be written to: .context/reports/regression-{date}.md
```

### Notify Team (Optional)

If Slack integration is configured:

```bash
# Post summary to Slack (placeholder - actual implementation depends on setup)
# curl -X POST -H 'Content-type: application/json' \
#   --data '{"text":"Regression Report: {verdict}"}' \
#   $SLACK_WEBHOOK_URL
```

---

## Post-Report Actions

### If GO Decision

1. Mark release candidate as approved
2. Proceed with deployment
3. Schedule post-deployment smoke test

### If CAUTION Decision

1. Review with team lead
2. Assess risk of known issues
3. Document accepted risks
4. Proceed with caution or defer

### If NO-GO Decision

1. Block release
2. Assign regression issues to developers
3. Schedule fix verification
4. Re-run regression after fixes

---

## Feedback Loop

### Update Stage 1 (Shift-Left)

Based on regression findings, suggest:
- New test cases for undertested areas
- ATP updates for missed scenarios

### Update Stage 4 (Automation)

Based on flaky tests, schedule:
- Test stabilization work
- Locator improvements
- Wait strategy updates

---

## Report Checklist

Before finalizing:

- [ ] All metrics calculated correctly
- [ ] Regressions properly categorized
- [ ] Issues created for blockers
- [ ] Decision rationale is clear
- [ ] Links are valid
- [ ] Report is stakeholder-friendly
- [ ] Recommendations are actionable

---

## Output Location

Save the report to:

```
.context/reports/
└── regression-{env}-{date}.md

Example:
.context/reports/regression-staging-2026-02-11.md
```

---

**Report Generation Complete** - Share with stakeholders and proceed based on decision.
