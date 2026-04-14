---
name: regression-testing
description: Execute regression test suites via CI/CD, analyze results, classify failures, and produce GO/NO-GO release decisions. Use when running regression, smoke, or sanity suites through GitHub Actions, monitoring workflow runs, downloading Allure or Playwright artifacts, classifying failures (REGRESSION vs FLAKY vs KNOWN vs ENVIRONMENT vs NEW TEST), computing pass-rate and trend metrics, deciding release readiness, generating executive quality reports, or creating regression issues. Triggers on: run regression, trigger test workflow, analyze test results, quality report, GO/NO-GO decision, release readiness, flaky tests, Allure report, smoke suite, pass rate, nightly test failure, stage 6. Do NOT use for writing new regression tests (that belongs to test-automation) or for manual fix verification (that belongs to sprint-testing).
license: MIT
compatibility: claude-code, copilot, cursor, codex, opencode
---

# Regression Testing — Execute, Analyze, Decide

Orchestrates the full release-readiness pipeline: trigger a CI suite, monitor it to completion, classify failures, score against release criteria, and emit a GO / CAUTION / NO-GO verdict plus a stakeholder report.

Three phases, always in this order: **Execute → Analyze → Report**. Do not skip analysis and jump to a report. Do not guess classification without reading failure logs.

---

## When to run each suite

| Suite | Workflow file | Duration | Use when |
|-------|---------------|----------|----------|
| `regression` | `regression.yml` | 20-60 min | Pre-release validation, nightly full run |
| `smoke` | `smoke.yml` | 2-5 min | Post-deploy health check, `@critical` only |
| `sanity` | `sanity.yml` | 1-10 min | Validate one feature / one file / one grep pattern |

If the user says "run regression" with no qualifier, default to `regression` on `{{DEFAULT_ENV}}`. If they say "smoke" or "critical only", use `smoke`. If they specify a file, grep, or single feature, use `sanity`.

---

## Phase 1 — Execute

### Preflight (always)

```bash
gh auth status
gh repo view --json name,owner
gh workflow list
```

If `gh` is not authenticated, stop and ask the user to run `gh auth login`. Do not proceed.

### Trigger

```bash
# Full regression
gh workflow run regression.yml \
  -f environment=staging \
  -f video_record=false \
  -f generate_allure=true

# Smoke
gh workflow run smoke.yml -f environment=staging -f generate_allure=true

# Sanity (grep OR test_file, never both)
gh workflow run sanity.yml -f environment=staging -f test_type=e2e -f grep="@auth"
gh workflow run sanity.yml -f environment=staging -f test_file="tests/e2e/auth/login.test.ts"
```

### Capture run ID

```bash
# Wait 3-5 seconds for the run to register, then:
gh run list --workflow=regression.yml --limit=1 --json databaseId,status,createdAt -q '.[0].databaseId'
```

Store as `RUN_ID`. Every subsequent step uses it.

### Monitor to completion

Prefer `gh run watch <RUN_ID>` (blocking, live). If non-blocking is needed, poll:

```bash
gh run view <RUN_ID> --json status,conclusion
# status: queued | in_progress | completed
# conclusion (only when completed): success | failure | cancelled | timed_out
```

Do not start Phase 2 until `status == completed`.

### Output of Phase 1

A short execution summary with: workflow name, run ID, environment, duration, conclusion, per-job status, artifact list, and the Allure URL pattern `https://{owner}.github.io/{repo}/{environment}/{suite}/`.

Read `references/ci-cd-integration.md` when configuring new workflows, debugging CI-only failures, tuning sharding / retries / timeouts, or wiring up secrets and variables.

---

## Phase 2 — Analyze

### Step 1: Collect data

```bash
# Full run context
gh run view <RUN_ID> --json status,conclusion,jobs,createdAt,updatedAt,url,headBranch,event,actor

# Failed logs only (much smaller than --log)
gh run view <RUN_ID> --log-failed

# List artifacts, then download the ones you need
gh run view <RUN_ID> --json artifacts --jq '.artifacts[].name'
gh run download <RUN_ID> -n merged-allure-results-staging -D ./analysis/
gh run download <RUN_ID> -n e2e-failure-evidence       -D ./analysis/evidence/
gh run download <RUN_ID> -n e2e-playwright-report      -D ./analysis/playwright/
```

### Step 2: Parse results

Source of truth priority: **Allure results JSON > Playwright `report.json` > raw logs**. Each Allure result has `status`, `statusDetails.message`, `statusDetails.trace`, and `labels[]` (look for `testId` = ATC ID, `suite`, and `severity`).

### Step 3: Compute metrics

| Metric | Formula |
|--------|---------|
| Total | count of results |
| Passed / Failed / Skipped / Broken | count by `status` |
| Pass Rate | `Passed / Total * 100` |
| Duration | `max(stop) - min(start)` |
| Trend | current pass rate − previous run pass rate |

Previous-run comparison requires downloading artifacts of the previous run:

```bash
PREV=$(gh run list --workflow=regression.yml --limit=2 --json databaseId -q '.[1].databaseId')
gh run download $PREV -n merged-allure-results-staging -D ./analysis/previous/
```

### Step 4: Classify every failure

Apply this decision tree to each failed test. **Never mark a test REGRESSION without checking history first** — that is the single most common misclassification.

```
Failed test
  │
  ├── Linked to a known-issue ticket? ───────► KNOWN ISSUE
  │
  ├── Error matches environment pattern? ────► ENVIRONMENT ISSUE
  │   (ECONNREFUSED, ETIMEDOUT, net::ERR_, Navigation timeout,
  │    browserType.launch, 502/503, context deadline exceeded)
  │
  ├── No history (first-ever run)? ──────────► NEW TEST FAILURE
  │
  ├── Failure rate > 20% over last 10 runs? ─► FLAKY
  │
  └── Passed in last ≤ 5 runs, now fails? ───► REGRESSION   (release blocker)
```

| Category | Impact | Action |
|----------|--------|--------|
| REGRESSION | HIGH | Block release, create issue, assign |
| FLAKY | MEDIUM | Schedule stabilization, do not block |
| KNOWN ISSUE | LOW | Document, do not block |
| ENVIRONMENT | MEDIUM | Re-run after infra check |
| NEW TEST | LOW | Manual verification, then accept or fix |

Read `references/failure-classification.md` when: the decision tree is ambiguous, you need the full error-pattern catalogue, you are classifying a borderline case, or you are computing flakiness over historical runs.

### Step 5: Assess severity per failure

Severity is independent of classification. A FLAKY test on the checkout flow is still CRITICAL severity.

| Severity | Criteria |
|----------|----------|
| CRITICAL | Core user journey (login, checkout, payment). Any `@critical` tagged test. |
| HIGH | Major feature (search, profile, dashboard) |
| MEDIUM | Secondary feature (filters, preferences) |
| LOW | Edge case or admin-only path |

### Output of Phase 2

An analysis block with: metrics table, trend delta, one section per failure category (Regressions first, then Flaky, Known, Environment, New), per-failed-test detail (name, ATC ID, suite, error, last-pass date, screenshot link), job summary, and a preliminary verdict.

---

## Phase 3 — Report & Decide

### GO / CAUTION / NO-GO scoring

Compute a weighted score from the analysis. Maximum is 9.

| Factor | +3 | +1 | 0 | -1 | -2 | -3 |
|--------|----|----|---|----|----|----|
| Pass Rate | ≥ 95% | 90–95% | | | < 90% | |
| Regressions | 0 | 1-2 Low | | 1+ Medium | | Any High/Critical |
| Critical tests | All pass | | | | | Any fail |
| Flaky tests | | ≤ 3 | 4-5 | > 5 | | |

**Verdict thresholds:**
- Score **≥ 7** → **GO** — release approved
- Score **4-6** → **CAUTION** — manual review required, document accepted risks
- Score **< 4** → **NO-GO** — block release, fix regressions, re-run

Never auto-GO if: any `@critical` test fails, any REGRESSION with HIGH/CRITICAL severity exists, or pass rate < 90%. These are hard vetoes regardless of score.

### Create issues (when decision = NO-GO or CAUTION with regressions)

For each REGRESSION, open one issue:

```bash
gh issue create \
  --title "[REGRESSION] {test_name} failing in {suite}" \
  --label "regression,bug,automated-tests" \
  --body "$(cat <<EOF
## Regression Details
- Test ID: {atc_id}
- Suite: {suite}
- Run ID: {run_id}
- Environment: {environment}

## Error
\`\`\`
{error_message}
\`\`\`

## Evidence
- [Workflow run]({run_url})
- [Allure report]({allure_url})

## Last passed
{last_pass_date} (Run #{last_pass_run})
EOF
)"
```

Save the returned issue number to reference in the report.

### TMS sync (optional, when `.context/test-management-system.md` is configured)

```
[TMS_TOOL] Update Test Execution:
  executionKey: {execution-key}
  results: {per-ATC status + failure comments from Phase 2}
```

Resolve `[TMS_TOOL]` via CLAUDE.md Tool Resolution (typically `/xray-cli` skill — load it if available).

### Write the report

Save to `.context/reports/regression-{env}-{date}.md`. Use `references/failure-classification.md` only if you need the pattern catalogue; the report template itself is inline below.

---

## Report template

```markdown
# Regression Quality Report — {env} — {date}

## Executive Summary
**Verdict: {GO / CAUTION / NO-GO}**
Score: {score}/9. {one-line rationale}

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Pass Rate | {x}% | >= 95% | {ok/warn/fail} |
| Regressions | {n} | 0 | {ok/warn/fail} |
| Critical failures | {n} | 0 | {ok/warn/fail} |
| Flaky | {n} | <= 3 | {ok/warn/fail} |
| Duration | {d} | - | - |

## Release Blockers
{if NO-GO, enumerate regressions with severity, owner, ETA. Otherwise: "None."}

## Failure Details
### Regressions ({n})
  - {test} | {atc_id} | last passed {date} | [issue]({url}) | probable cause: {...}

### Flaky ({n}) — schedule stabilization
### Known Issues ({n}) — accepted
### Environment ({n}) — re-run after infra check

## Trend (last 5 runs)
{ASCII sparkline or pass-rate table}

## Links
- Workflow run: {url}
- Allure: {url}
- Created issues: {list}
- TMS execution: {key / url}

## Recommendations
1. Immediate (pre-release): {...}
2. Short-term (this sprint): {...}
3. Long-term (tech debt): {...}
```

### Post-decision actions

| Decision | Actions |
|----------|---------|
| GO | Mark release candidate approved; schedule post-deploy smoke |
| CAUTION | Review with team lead; document accepted risks; proceed deliberately |
| NO-GO | Block release; assign regression issues; schedule fix verification; plan re-run |

---

## Gotchas

- **Allure URL is predictable but only live after the "Build & Deploy Allure Report" job succeeds.** If that job failed, the URL 404s — analyze from downloaded artifacts instead.
- **`gh run watch` can time out** on long suites. Fall back to polling `gh run view <RUN_ID> --json status` every 60-90 seconds.
- **`gh run view --log` dumps every step's output** and is often >50MB on large suites. Always prefer `--log-failed` during analysis; use `--job=<JOB_ID> --log` for targeted drilldown.
- **Retries mask flakiness.** Playwright is configured with `retries: 2` in CI. A test that passes on retry is still flaky — inspect `retries` count in Allure, not just final status.
- **ENVIRONMENT is not a scapegoat.** `ECONNREFUSED` to your app's own API probably means the app crashed, not "infra glitch". Check if the same run has many unrelated tests failing on the same host — that is environment. One test failing with a network error on an endpoint that other tests hit successfully is more likely a REGRESSION.
- **Never mark NEW TEST as REGRESSION.** A first-ever failure with no history is not a regression — it is unverified. Manually confirm once before classifying.
- **Flakiness needs 10 runs of history minimum.** If you don't have 10 runs, mark it as "insufficient history" and re-evaluate next sprint. Do not guess.
- **Sanity + `grep` and `test_file` are mutually exclusive.** Passing both makes the workflow ignore one silently. Pick one.
- **Video recording inflates artifact size by 5-10x.** Only enable `video_record=true` when debugging flakiness or capturing bug evidence. Never enable it for nightly regression.
- **CI credentials come from GitHub secrets, not `.env`.** Do not copy values from local `.env` into workflow YAML — reference `${{ secrets.NAME }}` only.

---

## Specific tasks

* **Configuring or debugging GitHub Actions workflows** — read `references/ci-cd-integration.md`
* **Classifying a borderline failure (REGRESSION vs FLAKY vs ENVIRONMENT)** — read `references/failure-classification.md`
* **TMS / Xray result import** — load `/xray-cli` skill
* **Downloading traces or screenshots for a failure** — use `[AUTOMATION_TOOL]` per CLAUDE.md Tool Resolution; for Playwright trace inspection load `/playwright-cli`

---

## Quick reference

```bash
# Trigger + get run ID in one shot
gh workflow run regression.yml -f environment=staging && sleep 5 && \
  RUN_ID=$(gh run list --workflow=regression.yml --limit=1 --json databaseId -q '.[0].databaseId') && \
  echo "RUN_ID=$RUN_ID"

# Wait for completion
gh run watch $RUN_ID

# Failed logs only
gh run view $RUN_ID --log-failed

# All failure evidence
gh run download $RUN_ID -n e2e-failure-evidence -D ./analysis/evidence/

# Previous run for trend
PREV=$(gh run list --workflow=regression.yml --limit=2 --json databaseId -q '.[1].databaseId')
gh run download $PREV -n merged-allure-results-staging -D ./analysis/previous/
```
