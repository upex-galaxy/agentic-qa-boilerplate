# Regression Analysis

> **Phase**: 2 of 3 (Execution → Analysis → Report)
> **Purpose**: Analyze test results, classify failures, and calculate quality metrics.
> **Output**: Failure classification, metrics, and preliminary GO/NO-GO recommendation.

---

## Context Loading

**Load these files for reference:**

1. `.context/guidelines/TAE/kata-ai-index.md` → Understand ATC structure
2. `.context/test-management-system.md` → For known issues and TMS links
3. Run artifacts (downloaded in this phase)

---

## Input Required

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ANALYSIS PARAMETERS                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ Run ID:          _________________________________ (required)               │
│                                                                             │
│ Allure URL:      _________________________________ (optional, auto-detect)  │
│                                                                             │
│ Known Issues:    _________________________________ (comma-separated tickets)│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Analysis Workflow

### Step 1: Gather Run Information

Retrieve comprehensive run data:

```bash
# Get full run details
gh run view <RUN_ID> --json \
  status,conclusion,jobs,createdAt,updatedAt,url,headBranch,event,actor

# Get job-level details with steps
gh run view <RUN_ID> --json jobs --jq '.jobs[] | {name, conclusion, steps: [.steps[] | {name, conclusion}]}'
```

Expected structure:
```json
{
  "status": "completed",
  "conclusion": "failure",
  "jobs": [
    {
      "name": "Integration Tests",
      "conclusion": "success",
      "steps": [...]
    },
    {
      "name": "E2E Tests",
      "conclusion": "failure",
      "steps": [...]
    }
  ]
}
```

---

### Step 2: Analyze Failed Jobs

For each failed job, get detailed logs:

```bash
# Get only failed logs (focused output)
gh run view <RUN_ID> --log-failed

# Or get logs for specific job
gh run view <RUN_ID> --job=<JOB_ID> --log
```

Parse logs looking for:

| Pattern | Meaning |
|---------|---------|
| `Error:` | Test assertion failure |
| `Timeout` | Element/response wait exceeded |
| `locator.click` | Element interaction failure |
| `expect(...)` | Assertion failure |
| `status code` | API response mismatch |
| `ECONNREFUSED` | Environment/network issue |

---

### Step 3: Download Artifacts

Download test results for detailed analysis:

```bash
# List available artifacts
gh run view <RUN_ID> --json artifacts --jq '.artifacts[].name'

# Download merged Allure results
gh run download <RUN_ID> -n merged-allure-results-staging -D ./analysis/

# Download failure evidence (screenshots, traces)
gh run download <RUN_ID> -n e2e-failure-evidence -D ./analysis/evidence/

# Download Playwright report
gh run download <RUN_ID> -n e2e-playwright-report -D ./analysis/playwright/
```

---

### Step 4: Parse Test Results

#### From Allure Results

Read the Allure result JSON files:

```bash
# List result files
ls ./analysis/merged-allure-results-staging/*.json
```

Parse each result file to extract:

```json
{
  "uuid": "abc123",
  "name": "should login successfully",
  "status": "failed",
  "statusDetails": {
    "message": "Element [data-testid='login-btn'] not found",
    "trace": "..."
  },
  "labels": [
    {"name": "suite", "value": "Auth Tests"},
    {"name": "testId", "value": "AUTH-001"}
  ],
  "start": 1707654321000,
  "stop": 1707654325000
}
```

#### From Playwright Report

If Allure is unavailable, parse Playwright JSON:

```bash
cat ./analysis/playwright/report.json
```

---

### Step 5: Calculate Metrics

#### Core Metrics

| Metric | Calculation |
|--------|-------------|
| **Total Tests** | Count of all test results |
| **Passed** | Count where `status = passed` |
| **Failed** | Count where `status = failed` |
| **Skipped** | Count where `status = skipped` |
| **Broken** | Count where `status = broken` |
| **Pass Rate** | `(Passed / Total) * 100` |
| **Duration** | `max(stop) - min(start)` from results |

#### Trend Metrics (if historical data available)

| Metric | Calculation |
|--------|-------------|
| **Previous Pass Rate** | From last run |
| **Delta** | Current - Previous |
| **Trend** | ↑ Improving / ↓ Degrading / → Stable |

---

### Step 6: Classify Failures

Apply classification logic to each failed test:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      FAILURE CLASSIFICATION LOGIC                           │
└─────────────────────────────────────────────────────────────────────────────┘

                         ┌──────────────────┐
                         │  Failed Test     │
                         └────────┬─────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │ Is test in Known Issues? │
                    └─────────────┬─────────────┘
                           │             │
                          YES           NO
                           │             │
                           ▼             ▼
                    ┌──────────┐   ┌──────────────────┐
                    │ KNOWN    │   │ Did it pass in   │
                    │ ISSUE    │   │ last 5 runs?     │
                    └──────────┘   └────────┬─────────┘
                                       │         │
                                      YES       NO
                                       │         │
                                       ▼         ▼
                              ┌───────────┐  ┌──────────────┐
                              │ REGRESSION│  │ Is error     │
                              │ (new fail)│  │ env-related? │
                              └───────────┘  └──────┬───────┘
                                                │         │
                                               YES       NO
                                                │         │
                                                ▼         ▼
                                       ┌────────────┐  ┌─────────────┐
                                       │ ENVIRONMENT│  │ Check flaky │
                                       │ ISSUE      │  │ history     │
                                       └────────────┘  └──────┬──────┘
                                                          │         │
                                                       > 20%     ≤ 20%
                                                          │         │
                                                          ▼         ▼
                                                    ┌─────────┐  ┌──────────┐
                                                    │ FLAKY   │  │ NEW TEST │
                                                    │ TEST    │  │ FAILURE  │
                                                    └─────────┘  └──────────┘
```

#### Classification Criteria

| Category | Criteria | Impact | Action |
|----------|----------|--------|--------|
| **REGRESSION** | Test passed recently, now fails consistently | HIGH | Block release, create issue |
| **FLAKY** | Fails intermittently (>20% failure rate in last 10 runs) | MEDIUM | Mark for stabilization |
| **KNOWN ISSUE** | Linked to existing backlog ticket | LOW | Document, don't block |
| **ENVIRONMENT** | Timeout, network, or infrastructure error | MEDIUM | Re-run or investigate infra |
| **NEW TEST** | First execution, no history | LOW | Manual verification needed |

#### Environment Issue Indicators

Error contains any of:
- `ECONNREFUSED`
- `ETIMEDOUT`
- `net::ERR_`
- `Navigation timeout`
- `browserType.launch`
- `context deadline exceeded`
- `502 Bad Gateway`
- `503 Service Unavailable`

---

### Step 7: Extract Test Details

For each failed test, gather:

| Field | Source | Example |
|-------|--------|---------|
| **Test Name** | `name` field | `should login successfully` |
| **Test ID** | `labels[testId]` or `@atc` | `AUTH-001` |
| **Suite** | `labels[suite]` | `Auth Tests` |
| **Error Message** | `statusDetails.message` | `Element not found` |
| **Duration** | `stop - start` | `4.2s` |
| **Screenshot** | Failure evidence artifact | `login-failure.png` |

---

## Output Template

Generate the following analysis report:

```markdown
# Analysis Report

**Run ID**: {run_id}
**Analyzed At**: {timestamp}
**Workflow**: {workflow_name}
**Environment**: {environment}

---

## Execution Metrics

| Metric | Value |
|--------|-------|
| Total Tests | {total} |
| Passed | {passed} |
| Failed | {failed} |
| Skipped | {skipped} |
| Broken | {broken} |
| **Pass Rate** | {pass_rate}% |
| Duration | {duration} |

### Trend (vs Previous Run)

| Metric | Previous | Current | Delta |
|--------|----------|---------|-------|
| Pass Rate | {prev}% | {curr}% | {delta}% {trend_icon} |
| Failed | {prev_failed} | {curr_failed} | {diff} |

---

## Failed Tests Classification

### REGRESSIONS ({count}) - Release Blockers

| Test Name | Test ID | Error | Last Pass |
|-----------|---------|-------|-----------|
| {name} | {atc_id} | {error_summary} | {last_pass_date} |

<details>
<summary>Regression Details</summary>

#### {test_name}
- **Test ID**: {atc_id}
- **Suite**: {suite}
- **Error**:
  ```
  {full_error_message}
  ```
- **Last Passed**: {date} (Run #{run_number})
- **Screenshot**: [View]({screenshot_path})

</details>

---

### FLAKY TESTS ({count}) - Needs Stabilization

| Test Name | Test ID | Failure Rate | Last 10 Runs |
|-----------|---------|--------------|--------------|
| {name} | {atc_id} | {rate}% | ✓✓✗✓✗✓✓✓✗✓ |

---

### KNOWN ISSUES ({count}) - Expected Failures

| Test Name | Test ID | Ticket | Status |
|-----------|---------|--------|--------|
| {name} | {atc_id} | {PROJ-XXX} | {ticket_status} |

---

### ENVIRONMENT ISSUES ({count}) - Infrastructure Problems

| Test Name | Test ID | Error Type |
|-----------|---------|------------|
| {name} | {atc_id} | {Timeout/Network/etc} |

**Recommendation**: Re-run after infrastructure check

---

### NEW TEST FAILURES ({count}) - Needs Investigation

| Test Name | Test ID | Error |
|-----------|---------|-------|
| {name} | {atc_id} | {error_summary} |

---

## Job Summary

| Job | Result | Duration | Failed Tests |
|-----|--------|----------|--------------|
| Integration Tests | ✅ success | 5m 12s | 0 |
| E2E Tests | ❌ failure | 8m 45s | 6 |

---

## Preliminary Recommendation

### Decision Matrix

| Factor | Status | Weight | Score |
|--------|--------|--------|-------|
| Pass Rate ≥ 95% | {status} | 2 | {score} |
| No Regressions | {status} | 3 | {score} |
| No Critical Failures | {status} | 3 | {score} |
| Flaky Tests ≤ 3 | {status} | 1 | {score} |
| **Total** | | | **{total}/9** |

### Verdict

{verdict_icon} **{GO / CAUTION / NO-GO}**

**Reason**: {explanation}

### Blocking Issues

1. {issue_1}
2. {issue_2}

### Non-Blocking Issues

1. {issue_1}
2. {issue_2}

---

## Artifacts Analyzed

| Artifact | Path | Status |
|----------|------|--------|
| Allure Results | ./analysis/merged-allure-results-staging/ | ✅ Analyzed |
| Failure Evidence | ./analysis/evidence/ | ✅ {count} files |
| Playwright Report | ./analysis/playwright/ | ✅ Available |

---

## Links

- [GitHub Actions Run]({run_url})
- [Allure Report]({allure_url})
- [Failure Screenshots]({evidence_path})

---

## Next Steps

→ **Proceed to**: `regression-report.md` (Phase 3)
→ **With**: This analysis for stakeholder report generation
```

---

## Analysis Helpers

### Get Test History (if available)

```bash
# List recent runs of the same workflow
gh run list --workflow=regression.yml --limit=10 --json databaseId,conclusion,createdAt
```

### Compare with Previous Run

```bash
# Get previous run ID
PREV_RUN=$(gh run list --workflow=regression.yml --limit=2 --json databaseId -q '.[1].databaseId')

# Download previous results for comparison
gh run download $PREV_RUN -n merged-allure-results-staging -D ./analysis/previous/
```

### Search for Known Issues

```bash
# If using GitHub Issues
gh issue list --label "test-failure" --json number,title,state

# Cross-reference with test ID
gh issue list --search "AUTH-001 in:title"
```

---

## Classification Quick Reference

| Error Pattern | Likely Classification |
|--------------|----------------------|
| `Element not found` | REGRESSION (UI change) |
| `Timeout waiting for selector` | REGRESSION or FLAKY |
| `expect(...).toBe(...)` | REGRESSION (logic change) |
| `status code 500` | ENVIRONMENT or REGRESSION |
| `ECONNREFUSED` | ENVIRONMENT |
| `Navigation timeout` | ENVIRONMENT or FLAKY |
| `Test passed before` + `now fails` | REGRESSION |
| `Intermittent in history` | FLAKY |

---

## Severity Assessment

| Severity | Criteria | Examples |
|----------|----------|----------|
| **CRITICAL** | Core user journey blocked | Login, Checkout, Payment |
| **HIGH** | Major feature broken | Search, Profile, Dashboard |
| **MEDIUM** | Minor feature affected | Filters, Sorting, Preferences |
| **LOW** | Edge case failure | Rare scenarios, Admin features |

Map severity based on:
1. Test tags (`@critical`, `@smoke`)
2. Suite name (Auth, Booking, etc.)
3. Business impact documented in TMS

---

## Next Step

Once analysis is complete:

→ **Proceed to**: `regression-report.md` (Phase 3)
→ **With**: This analysis document for stakeholder report generation
