# Regression Execution

> **Phase**: 1 of 3 (Execution → Analysis → Report)
> **Purpose**: Execute automated test suites via GitHub Actions and monitor to completion.
> **Output**: Run ID, execution status, and summary ready for analysis.

---

## Context Loading

**Load these files for reference:**

1. `.github/workflows/regression.yml` → Full regression workflow structure
2. `.github/workflows/smoke.yml` → Smoke test workflow
3. `.github/workflows/sanity.yml` → Sanity test workflow
4. `.context/test-management-system.md` → TMS configuration (if syncing)

---

## Input Required

Specify what type of regression to execute:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ EXECUTION PARAMETERS                                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ Suite Type:      ○ regression (full)    ○ smoke (critical)    ○ sanity     │
│                                                                             │
│ Environment:     ○ {{DEFAULT_ENV}} (default)    ○ local                            │
│                                                                             │
│ Generate Allure: ○ yes (default)        ○ no                               │
│                                                                             │
│ [For sanity only]                                                           │
│ ─────────────────────────────────────────────────────────────────────────  │
│ Test Type:       ○ all    ○ e2e    ○ integration                           │
│ Grep Pattern:    _________________________________ (e.g., @auth, login)    │
│ Test File:       _________________________________ (e.g., tests/e2e/...)   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Quick Selection Examples

| Scenario | Suite | Parameters |
|----------|-------|------------|
| Full regression before release | `regression` | `environment=staging` |
| Daily health check | `smoke` | `environment=staging` |
| Validate specific feature | `sanity` | `grep="@booking"`, `test_type=e2e` |
| Run single test file | `sanity` | `test_file="tests/e2e/auth/login.test.ts"` |
| API tests only | `sanity` | `test_type=integration` |

---

## Execution Workflow

### Step 1: Validate Prerequisites

Before triggering, verify:

```bash
# Check gh CLI is authenticated
gh auth status

# Verify repository access
gh repo view --json name,owner

# List available workflows
gh workflow list
```

Expected output:
```
NAME              STATE   ID
Regression Tests  active  12345678
Smoke Tests       active  12345679
Sanity Tests      active  12345680
```

---

### Step 2: Trigger Workflow

Execute the appropriate workflow based on input:

#### For Full Regression

```bash
gh workflow run regression.yml \
  -f environment=staging \
  -f video_record=false \
  -f generate_allure=true
```

#### For Smoke Tests

```bash
gh workflow run smoke.yml \
  -f environment=staging \
  -f generate_allure=true
```

#### For Sanity Tests

```bash
# With grep pattern
gh workflow run sanity.yml \
  -f environment=staging \
  -f test_type=e2e \
  -f grep="@auth" \
  -f generate_allure=true

# With specific file
gh workflow run sanity.yml \
  -f environment=staging \
  -f test_file="tests/e2e/auth/login.test.ts" \
  -f generate_allure=true

# Integration tests only
gh workflow run sanity.yml \
  -f environment=staging \
  -f test_type=integration \
  -f generate_allure=true
```

---

### Step 3: Capture Run ID

Immediately after triggering, get the run ID:

```bash
# Wait a few seconds for the run to appear
sleep 5

# Get the most recent run ID
gh run list --workflow={workflow}.yml --limit=1 --json databaseId,status,createdAt
```

Expected output:
```json
[
  {
    "databaseId": 12345678901,
    "status": "in_progress",
    "createdAt": "2026-02-11T14:30:00Z"
  }
]
```

Extract and store the `databaseId` as `RUN_ID` for subsequent steps.

---

### Step 4: Monitor Execution

#### Option A: Watch in Real-Time

```bash
gh run watch <RUN_ID>
```

This blocks until the run completes, showing live progress.

#### Option B: Poll Status (Non-Blocking)

```bash
# Check status
gh run view <RUN_ID> --json status,conclusion

# Expected during execution:
# {"status":"in_progress","conclusion":null}

# Expected after completion:
# {"status":"completed","conclusion":"success"}
# {"status":"completed","conclusion":"failure"}
```

#### Option C: Get Detailed Job Status

```bash
gh run view <RUN_ID> --json jobs --jq '.jobs[] | {name, status, conclusion}'
```

Expected output:
```json
{"name":"Integration Tests","status":"completed","conclusion":"success"}
{"name":"E2E Tests","status":"in_progress","conclusion":null}
{"name":"Build & Deploy Allure Report","status":"queued","conclusion":null}
```

---

### Step 5: Capture Final Status

Once completed, get full execution summary:

```bash
gh run view <RUN_ID> --json status,conclusion,jobs,createdAt,updatedAt,url
```

Parse the response to extract:

| Field | Description | Example |
|-------|-------------|---------|
| `status` | Run status | `completed` |
| `conclusion` | Final result | `success` \| `failure` |
| `url` | GitHub Actions URL | `https://github.com/.../runs/...` |
| `createdAt` | Start time | `2026-02-11T14:30:00Z` |
| `updatedAt` | End time | `2026-02-11T14:45:32Z` |
| `jobs` | Array of job results | See below |

---

## Output Template

Generate the following execution summary:

```markdown
## Execution Summary

| Attribute | Value |
|-----------|-------|
| **Workflow** | {workflow_name} |
| **Run ID** | {run_id} |
| **Environment** | {environment} |
| **Status** | ✅ Completed / ❌ Failed / 🔄 Running |
| **Conclusion** | success / failure / cancelled |
| **Duration** | {calculated_duration} |
| **Triggered By** | {actor} |
| **Timestamp** | {createdAt} |
| **URL** | [{run_id}]({url}) |

### Jobs Status

| Job | Status | Conclusion | Duration |
|-----|--------|------------|----------|
| Integration Tests | completed | ✅ success | 5m 12s |
| E2E Tests | completed | ❌ failure | 8m 45s |
| Build & Deploy Allure Report | completed | ✅ success | 1m 35s |

### Artifacts Generated

| Artifact | Available |
|----------|-----------|
| integration-allure-results | ✅ |
| e2e-allure-results | ✅ |
| merged-allure-results-staging | ✅ |
| e2e-playwright-report | ✅ |
| e2e-failure-evidence | ✅ |

### Allure Report URL

https://{owner}.github.io/{repo}/{environment}/{suite}/

---

## Next Steps

→ **If Status = SUCCESS**: Proceed to `regression-analysis.md` for metrics review
→ **If Status = FAILURE**: Proceed to `regression-analysis.md` for failure investigation
→ **Run ID for Analysis**: {run_id}
```

---

## Error Handling

### Workflow Not Found

```bash
# Error: could not find workflow 'regression.yml'
# Solution: List available workflows
gh workflow list

# Check if workflow is enabled
gh workflow view regression.yml
```

### Authentication Issues

```bash
# Error: HTTP 401
# Solution: Re-authenticate
gh auth login
```

### Run Failed to Start

```bash
# Verify inputs are valid
gh workflow view regression.yml --yaml | grep -A 20 "inputs:"

# Check for required secrets
# (This requires admin access or viewing workflow file)
```

### Timeout During Monitoring

```bash
# If gh run watch times out, check status manually
gh run view <RUN_ID> --json status,conclusion

# Re-run if needed
gh run rerun <RUN_ID>
```

---

## Execution Decisions

### Which Suite to Choose?

| Situation | Recommended Suite |
|-----------|-------------------|
| Pre-release validation | `regression` (full) |
| Post-deployment check | `smoke` (critical only) |
| Validate specific feature | `sanity` with grep |
| Debug a failing test | `sanity` with test_file |
| Nightly health check | `smoke` or `regression` (scheduled) |

### When to Use Video Recording

Enable `video_record=true` when:
- Debugging flaky tests
- Investigating visual issues
- Need evidence for bug reports

Note: Video recording increases execution time and artifact size.

---

## Scheduled vs Manual Execution

| Type | Trigger | Use Case |
|------|---------|----------|
| **Scheduled** | Cron (daily) | Nightly regression, continuous monitoring |
| **Manual** | `workflow_dispatch` | Pre-release, ad-hoc testing |

Check scheduled runs:
```bash
gh run list --workflow=regression.yml --event=schedule --limit=5
```

---

## Quick Reference Commands

```bash
# Trigger full regression
gh workflow run regression.yml -f environment=staging

# Get latest run ID
gh run list --workflow=regression.yml --limit=1 --json databaseId -q '.[0].databaseId'

# Watch execution
gh run watch $(gh run list --workflow=regression.yml --limit=1 --json databaseId -q '.[0].databaseId')

# Check if completed
gh run view <RUN_ID> --json conclusion -q '.conclusion'

# Get GitHub Actions URL
gh run view <RUN_ID> --json url -q '.url'
```

---

## Next Step

Once execution completes:

→ **Proceed to**: `regression-analysis.md` (Phase 2)
→ **With**: Run ID from this execution
