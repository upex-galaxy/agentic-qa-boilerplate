# Stage 6: Regression Testing

> **Purpose**: Execute automated test suites, analyze results, and generate quality reports to make GO/NO-GO decisions.
> **Iteration**: Per release, sprint, or on-demand (post-deployment validation).

---

## Overview

Stage 6 closes the testing cycle by executing automated tests and analyzing results. While Stages 1-5 focus on creating and automating tests, Stage 6 focuses on **running them systematically** and **making decisions based on results**.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TESTING LIFECYCLE                                   │
└─────────────────────────────────────────────────────────────────────────────┘

  Stage 1          Stage 2          Stage 3          Stage 4          Stage 5          Stage 6
  ───────          ───────          ───────          ───────          ───────          ───────
  Shift-Left   →   Exploratory  →   Reporting    →   Documentation → Automation   →   REGRESSION
  (Plan)           (Execute)        (Report)         (Document)       (Implement)      (Execute)
     │                 │                 │                │                │                │
     ▼                 ▼                 ▼                ▼                ▼                ▼
  ATP/TCs        Manual tests      ATR + Bugs      ATCs in TMS     Code in repo    Run & Report
                                                                          │
                  ◄────────────── Feedback Loop ────────────────────────◄─┘
```

---

## Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       STAGE 6: REGRESSION WORKFLOW                          │
└─────────────────────────────────────────────────────────────────────────────┘

                       ┌─────────────────────┐
                       │      TRIGGER        │
                       │  ─────────────────  │
                       │  • Manual request   │
                       │  • Daily schedule   │
                       │  • Post-deploy      │
                       └──────────┬──────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. EXECUTION (regression-execution.md)                                     │
│  ────────────────────────────────────────────────────────────────────────── │
│  • Select suite type: regression | smoke | sanity                           │
│  • Trigger workflow via `gh workflow run`                                   │
│  • Monitor execution until completion                                       │
│  • Output: Run ID, status, duration                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  2. ANALYSIS (regression-analysis.md)                                       │
│  ────────────────────────────────────────────────────────────────────────── │
│  • Download and parse test results                                          │
│  • Classify failures: REGRESSION | FLAKY | KNOWN | ENVIRONMENT              │
│  • Calculate metrics: pass rate, duration, trends                           │
│  • Output: Failure classification, metrics, preliminary recommendation      │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  3. REPORT (regression-report.md)                                           │
│  ────────────────────────────────────────────────────────────────────────── │
│  • Generate quality report with GO/NO-GO decision                           │
│  • Create issues for regressions (optional)                                 │
│  • Update TMS status (optional)                                             │
│  • Output: Quality report, created issues, recommendations                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Available Prompts

| Phase | Prompt | Purpose |
|-------|--------|---------|
| 1 | `regression-execution.md` | Execute test suite and monitor to completion |
| 2 | `regression-analysis.md` | Analyze results and classify failures |
| 3 | `regression-report.md` | Generate quality report and GO/NO-GO decision |

### When to Use Each

| Scenario | Prompt(s) to Use |
|----------|------------------|
| Full regression before release | All three in sequence |
| Quick health check | `regression-execution.md` (smoke) only |
| Investigate failures | `regression-analysis.md` with existing Run ID |
| Generate stakeholder report | `regression-report.md` with analysis |

---

## Available Workflows

| Workflow | File | Schedule | Purpose |
|----------|------|----------|---------|
| **Regression** | `regression.yml` | Daily 00:00 UTC | Full suite: Integration → E2E |
| **Smoke** | `smoke.yml` | Daily 02:00 UTC | Critical tests only (@critical tag) |
| **Sanity** | `sanity.yml` | Manual only | Specific tests by grep/file |

### Workflow Inputs

#### regression.yml

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `environment` | choice | staging | `local` \| `staging` |
| `video_record` | boolean | false | Enable video recording |
| `generate_allure` | boolean | true | Generate Allure report |

#### smoke.yml

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `environment` | choice | staging | `local` \| `staging` |
| `generate_allure` | boolean | true | Generate Allure report |

#### sanity.yml

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `environment` | choice | staging | `local` \| `staging` |
| `test_type` | choice | all | `all` \| `e2e` \| `integration` |
| `grep` | string | - | Test name pattern filter |
| `test_file` | string | - | Specific test file path |
| `generate_allure` | boolean | true | Generate Allure report |
| `custom_allure_url` | string | sanity | Custom report URL path |

---

## `gh` CLI Quick Reference

### Execute Workflows

```bash
# Full regression
gh workflow run regression.yml -f environment=staging -f generate_allure=true

# Smoke tests
gh workflow run smoke.yml -f environment=staging

# Sanity with grep pattern
gh workflow run sanity.yml -f environment=staging -f grep="@auth" -f test_type=e2e

# Sanity with specific file
gh workflow run sanity.yml -f environment=staging -f test_file="tests/e2e/auth/login.test.ts"
```

### Monitor Execution

```bash
# List recent runs
gh run list --workflow=regression.yml --limit=5

# Watch run in real-time
gh run watch <run-id>

# View run status
gh run view <run-id>

# View run status as JSON (for parsing)
gh run view <run-id> --json status,conclusion,jobs
```

### Analyze Results

```bash
# View failed logs only
gh run view <run-id> --log-failed

# Download artifacts
gh run download <run-id> -n merged-allure-results-staging

# List available artifacts
gh run view <run-id> --json artifacts
```

---

## Artifacts Reference

| Workflow | Artifact Name | Content |
|----------|---------------|---------|
| regression | `integration-allure-results` | API test Allure results |
| regression | `e2e-allure-results` | E2E test Allure results |
| regression | `merged-allure-results-{env}` | Combined results |
| regression | `e2e-playwright-report` | Playwright HTML report |
| smoke | `smoke-allure-results` | Smoke test results |
| sanity | `sanity-allure-results` | Sanity test results |
| all | `*-failure-evidence` | Screenshots, traces on failure |

---

## Allure Report URLs

Reports are deployed to GitHub Pages at:

```
https://{owner}.github.io/{repo}/{environment}/{suite}/

Examples:
- https://upex-galaxy.github.io/ai-driven-test-automation-boilerplate/staging/regression/
- https://upex-galaxy.github.io/ai-driven-test-automation-boilerplate/staging/smoke/
```

---

## Decision Framework

### GO/NO-GO Criteria

| Metric | GO | CAUTION | NO-GO |
|--------|-----|---------|-------|
| Pass Rate | ≥ 95% | 90-95% | < 90% |
| Regressions | 0 | 1-2 (low impact) | Any high impact |
| Critical Failures | 0 | 0 | Any |
| Flaky Tests | ≤ 3 | 4-5 | > 5 |

### Failure Classification

| Category | Criteria | Action |
|----------|----------|--------|
| **REGRESSION** | Test passed before, now fails | Create issue, block GO |
| **FLAKY** | Intermittent failure history | Mark for review |
| **KNOWN ISSUE** | Linked to existing ticket | Document, don't block |
| **ENVIRONMENT** | Infrastructure/timeout issue | Re-run or skip |
| **NEW TEST** | No previous history | Manual verification |

---

## Integration with Other Stages

### Feedback to Stage 1 (Shift-Left)

- Identify undertested areas from failure patterns
- Suggest new test cases based on regressions

### Feedback to Stage 5 (Automation)

- Report flaky tests for stabilization
- Identify tests needing maintenance

### TMS Sync (Stage 3/4 Integration)

- Update test execution status
- Link failures to test cases

---

## Related Files

- `.github/workflows/regression.yml` - Full regression workflow
- `.github/workflows/smoke.yml` - Smoke test workflow
- `.github/workflows/sanity.yml` - Sanity test workflow
- `.context/test-management-system.md` - TMS configuration
- `.context/guidelines/TAE/kata-ai-index.md` - KATA patterns

---

**Stage 6 completes the cycle**: Automated tests from Stage 5 are executed, analyzed, and reported to stakeholders for informed release decisions.
