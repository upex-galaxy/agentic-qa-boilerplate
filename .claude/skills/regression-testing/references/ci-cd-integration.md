# CI/CD Integration — GitHub Actions for Regression Testing

Read this when configuring new workflows, modifying existing ones, debugging CI-only failures, tuning sharding or retries, wiring secrets, or optimizing execution time.

---

## 1. Strategy matrix

| Trigger | Tests | Duration | Purpose |
|---------|-------|----------|---------|
| Pull request | Integration (API) | 2-5 min | Block PRs that break functionality |
| Push to main | Integration + E2E `@critical` | 5-10 min | Keep main green |
| Nightly (cron) | Full E2E suite (sharded) | 20-60 min | Regression + trend data |
| On release | Smoke (`@critical`) | 2-3 min | Post-deploy verification |

Do NOT run the full E2E suite on every PR — it is too slow and costly. Do NOT ignore flaky tests — fix them.

---

## 2. Workflow file layout

```
.github/workflows/
├── test-pr.yml           On: pull_request        → integration only
├── test-main.yml         On: push to main        → integration + E2E @critical + TMS sync
├── test-nightly.yml      On: schedule (cron)     → full E2E, sharded, Allure deploy
├── test-release.yml      On: release published   → smoke only
├── regression.yml        On: workflow_dispatch   → manual full regression
├── smoke.yml             On: workflow_dispatch   → manual smoke
└── sanity.yml            On: workflow_dispatch   → manual targeted (grep | test_file)
```

The three manual-dispatch workflows (`regression`, `smoke`, `sanity`) are what the regression-testing skill triggers via `gh workflow run`.

---

## 3. PR workflow — integration tests only

```yaml
name: Test - Pull Request
on:
  pull_request:
    branches: [main, develop]
    paths:
      - 'tests/**'
      - 'config/**'
      - 'package.json'
      - 'playwright.config.ts'

jobs:
  integration:
    name: Integration Tests
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bunx playwright install --with-deps chromium
      - run: bun run lint
      - run: bun run type-check
      - run: bun run test:integration
        env:
          TEST_ENV: ${{ vars.TEST_ENV }}
          API_BASE_URL: ${{ secrets.API_BASE_URL }}
          TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
          TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-results-pr
          path: |
            playwright-report/
            test-results/
          retention-days: 7
```

Key points:
- `paths:` filter avoids running on pure doc changes.
- Always install only `chromium` for PR speed; multi-browser matrix belongs in nightly.
- `if: always()` on artifact upload — otherwise a failed test step skips the upload and there is no evidence.

---

## 4. Main branch — integration + E2E critical + TMS sync

```yaml
name: Test - Main Branch
on:
  push:
    branches: [main]

jobs:
  integration:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bunx playwright install --with-deps
      - run: bun run test:integration
        env:
          TEST_ENV: ${{ vars.TEST_ENV }}
          API_BASE_URL: ${{ secrets.API_BASE_URL }}
          TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
          TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}

  e2e-critical:
    runs-on: ubuntu-latest
    needs: integration
    timeout-minutes: 15
    strategy:
      fail-fast: false
      matrix:
        browser: [chromium, firefox, webkit]
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bunx playwright install --with-deps ${{ matrix.browser }}
      - run: bun run test:e2e:critical
        env:
          TEST_ENV: ${{ vars.TEST_ENV }}
          BASE_URL: ${{ secrets.BASE_URL }}
          API_BASE_URL: ${{ secrets.API_BASE_URL }}
          TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
          TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report-${{ matrix.browser }}
          path: playwright-report/
          retention-days: 7
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-failures-${{ matrix.browser }}
          path: test-results/
          retention-days: 7

  sync-results:
    runs-on: ubuntu-latest
    needs: [integration, e2e-critical]
    if: always()
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun run test:sync
        env:
          AUTO_SYNC: true
          TMS_PROVIDER: xray
          XRAY_CLIENT_ID: ${{ secrets.XRAY_CLIENT_ID }}
          XRAY_CLIENT_SECRET: ${{ secrets.XRAY_CLIENT_SECRET }}
          BUILD_ID: ${{ github.run_id }}
```

Key points:
- `fail-fast: false` on the browser matrix — one browser failing should not cancel the others.
- `sync-results` runs `if: always()` so failures still sync to TMS.
- `needs:` ordering: integration must pass before E2E starts (save CI minutes).

---

## 5. Nightly — full suite, sharded, report published

```yaml
name: Test - Nightly Full Suite
on:
  schedule:
    - cron: '0 2 * * *'   # 2 AM UTC
  workflow_dispatch:

jobs:
  full-e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    strategy:
      fail-fast: false
      matrix:
        browser: [chromium, firefox, webkit]
        shard: [1/4, 2/4, 3/4, 4/4]
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bunx playwright install --with-deps ${{ matrix.browser }}
      - run: bun run test:e2e -- --shard=${{ matrix.shard }}
        env:
          TEST_ENV: ${{ vars.TEST_ENV }}
          BASE_URL: ${{ secrets.BASE_URL }}
          API_BASE_URL: ${{ secrets.API_BASE_URL }}
          TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
          TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report-${{ matrix.browser }}-${{ strategy.job-index }}
          path: playwright-report/
          retention-days: 14

  merge-reports:
    runs-on: ubuntu-latest
    needs: full-e2e
    if: always()
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with:
          path: all-reports/
      - run: bunx playwright merge-reports all-reports/
      - uses: actions/upload-artifact@v4
        with:
          name: nightly-full-report
          path: playwright-report/
          retention-days: 30

  notify-failures:
    runs-on: ubuntu-latest
    needs: merge-reports
    if: failure()
    steps:
      - uses: slackapi/slack-github-action@v1
        with:
          webhook-url: ${{ secrets.SLACK_WEBHOOK_URL }}
          payload: |
            {
              "text": "Nightly E2E tests failed",
              "blocks": [{
                "type": "section",
                "text": {
                  "type": "mrkdwn",
                  "text": "*Nightly E2E Tests Failed*\n<${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View results>"
                }
              }]
            }
```

Sharding: 3 browsers × 4 shards = 12 parallel jobs. A 60-minute suite completes in ~5-10 minutes wall time.

---

## 6. Playwright config for CI

```typescript
import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,        // Fail the build if someone committed test.only()
  retries: isCI ? 2 : 0,   // Retry flakes twice in CI
  workers: isCI ? 1 : undefined,  // Conservative to avoid CI OOM
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results.json' }],
    ['junit', { outputFile: 'junit-results.xml' }],
    isCI ? ['github'] : ['list'],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: isCI ? 'retain-on-failure' : 'on-first-retry',
    screenshot: 'only-on-failure',
    video: isCI ? 'retain-on-failure' : 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox',  use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit',   use: { ...devices['Desktop Safari'] } },
  ],
});
```

Rules:
- `forbidOnly: isCI` — non-negotiable. Prevents test.only() slipping into main.
- `retries: 2` — retries mask flakiness but stabilize pipelines. The Analyze phase must still flag tests that need a retry as flaky candidates.
- `workers: 1` in CI — avoid OOM on shared runners. Parallelize via sharding at workflow level instead.

---

## 7. package.json scripts

```json
{
  "scripts": {
    "test": "playwright test",
    "test:integration": "playwright test --project=integration",
    "test:e2e": "playwright test --project=e2e",
    "test:e2e:critical": "playwright test --project=e2e --grep @critical",
    "test:smoke": "playwright test --grep @critical",
    "test:sync": "bun run tests/utils/jiraSync.ts",
    "lint": "eslint .",
    "type-check": "tsc --noEmit"
  }
}
```

---

## 8. Secrets and variables

Repository Settings → Secrets → Actions:

| Secret | Value |
|--------|-------|
| `BASE_URL` | Frontend URL (e.g. `https://staging.example.com`) |
| `API_BASE_URL` | API URL (e.g. `https://api.staging.example.com`) |
| `TEST_USER_EMAIL` | Test account email |
| `TEST_USER_PASSWORD` | Test account password |
| `XRAY_CLIENT_ID` | Xray Cloud API client ID |
| `XRAY_CLIENT_SECRET` | Xray Cloud API client secret |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook for failure alerts |

Variables (non-secret):

| Variable | Value |
|----------|-------|
| `TEST_ENV` | `staging` / `production` (selector for the running job) |

Never copy local `.env` values into workflow YAML. Always reference `${{ secrets.NAME }}`.

---

## 9. Optimization playbook

### Sharding (parallel execution)

```yaml
strategy:
  matrix:
    shard: [1/4, 2/4, 3/4, 4/4]
steps:
  - run: bunx playwright test --shard=${{ matrix.shard }}
```

4 shards = ~4x faster. Merge reports at the end with `playwright merge-reports`.

### Dependency caching

```yaml
- uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ runner.os }}-${{ hashFiles('bun.lockb') }}
```

Saves 2-3 minutes per run.

### Fail-fast (when appropriate)

```yaml
strategy:
  fail-fast: true
  matrix:
    browser: [chromium, firefox, webkit]
```

Use fail-fast when browsers should behave identically and one failure implies the others will fail. Do NOT use it in nightly — you want full coverage even if one browser is broken.

### Path filters

```yaml
on:
  pull_request:
    paths:
      - 'tests/**'
      - 'config/**'
      - '!docs/**'
```

Skips the entire workflow on doc-only PRs.

---

## 10. Quality gates

In Settings → Branches → Branch protection:

- Require status checks to pass before merging.
- Select: `Test - Pull Request / integration`.
- Require branches to be up to date before merging.

Result: no PR merges to `main` with red integration tests.

---

## 11. Troubleshooting CI-only failures

### "Playwright browser installation failed"
Use `bunx playwright install --with-deps chromium`. The `--with-deps` flag installs system libraries.

### "Out of memory in CI"
Reduce `workers` in playwright.config.ts:
```typescript
workers: process.env.CI ? 1 : undefined
```

### "Tests flaky in CI, pass locally"
Three knobs, in order:
1. Bump timeouts: `timeout: isCI ? 60000 : 30000`.
2. Ensure retries are on: `retries: isCI ? 2 : 0`.
3. Add explicit waits for network idle on navigations: `await page.waitForLoadState('networkidle')`.

If the test still fails intermittently, it is genuinely flaky — surface it in the Analyze phase and schedule stabilization.

### "Artifacts not uploaded"
Add `if: always()`:
```yaml
- uses: actions/upload-artifact@v4
  if: always()
```
Without it, a failed test step aborts the job and skips artifact upload.

### "Secrets empty in forked PRs"
GitHub intentionally does not pass secrets to workflows from forked PRs. Mitigations:
- Mock API in integration tests (no secrets needed).
- Use `pull_request_target` for trusted operations only (security-sensitive — review carefully).

### "gh workflow run succeeds but no run appears"
Race condition — `gh run list` queries before the run registers. Always `sleep 3-5` before listing the run ID.

---

## 12. Do / don't

### Do
- Run integration on every PR (fast feedback).
- Run E2E critical on main + nightly full suite.
- Use sharding for any E2E suite > 10 minutes.
- Cache `~/.cache/ms-playwright` and `node_modules`.
- Always upload artifacts with `if: always()`.
- Notify Slack on nightly failures only (PR noise is counterproductive).
- Keep secrets out of logs — `::add-mask::` if you must echo them.

### Don't
- Run full E2E on every PR.
- Ignore flaky tests — either fix or quarantine with a tracking ticket.
- Skip cleanup between runs (test data pollution accumulates).
- Run without retries in CI (retries stabilize; analysis flags flakiness).
- Upload sensitive data in artifacts (screenshots can contain PII).
- Hard-code credentials in workflow YAML.

---

## 13. Monitoring the workflow run (Background dispatch)

The CI run is long (20-60 min). Blocking the main thread on `gh run watch` is wasteful — we delegate to a Monitor subagent and continue with preparation work in the main thread. This section is the canonical reference for the dispatch declared in `regression-testing/SKILL.md` §"Subagent Dispatch Strategy" → "Wait/monitor `gh run watch`" row.

**When to use**: every time we trigger a regression workflow that takes >5 min. (For `smoke` (2-5 min) the dispatch overhead is borderline; classify by actual wall time, not workflow name.)

**Dispatch (Background pattern)**:

Briefing (follows the 6-component format from `framework-core/references/briefing-template.md`):

```
Goal: Watch GitHub Actions run <RUN_ID> until it terminates and report final status.
Context docs:
  - .github/workflows/regression.yml (workflow definition)
  - <PBI_FOLDER>/test-report-skeleton.md (where main thread is preparing the scaffold)
Skills to load: (none — uses gh CLI directly)
Exact instructions:
  1. Run: gh run watch <RUN_ID> --exit-status
  2. Capture exit code and final status (success / failure / cancelled).
  3. Capture run duration (gh run view <RUN_ID> --json conclusion,createdAt,updatedAt).
  4. Capture count of failed tests if failure (gh run view <RUN_ID> --log-failed | grep -c "FAIL ").
Report format:
  JSON: { "runId": "<RUN_ID>", "status": "success|failure|cancelled", "exitCode": <int>, "durationSeconds": <int>, "failedTestCount": <int|null>, "logsAvailable": <bool> }
Rules:
  - Do NOT download artifacts — that is a separate Parallel dispatch.
  - Do NOT classify failures — that is a separate Parallel dispatch after artifacts arrive.
  - On gh CLI auth failure: stop and report; do not retry.
```

**While the Monitor runs, the main thread**:
- Reads prior report skeleton from `.context/regression-history/`.
- Prepares the report header with run metadata already known (commit SHA, branch, workflow name).
- Loads classification rubric from `failure-classification.md` so it's ready when the run terminates.

**On Monitor return**:
- If `status === "success"`: skip to artifact download (still Parallel — see SKILL.md §Subagent Dispatch Strategy) only for Allure/Playwright reports; classification step is skipped.
- If `status === "failure"`: dispatch the Parallel artifact download, then the Parallel classification.
- If `status === "cancelled"`: report to user, stop, await instruction.

### Fallback: polling when `gh run watch` is unavailable

If the runner doesn't support `gh run watch` (very old `gh` CLI, restricted network) or the watch errors out repeatedly, the Monitor subagent can fall back to polling — but this still runs inside the subagent, not on the main thread:

```bash
gh run view <RUN_ID> --json status,conclusion
# status: queued | in_progress | completed
# conclusion (only when completed): success | failure | cancelled | timed_out
```

Poll every 60-90 seconds. The Monitor still owns this loop; the orchestrator stays free.

### Manual cancellation

If the user cancels the run mid-watch (`gh run cancel <RUN_ID>` from another terminal), the Monitor returns `status: "cancelled"`. The orchestrator surfaces this to the user and waits for direction — do not silently re-trigger.

### Race condition reminder

`gh workflow run` returns before the run is queryable. The orchestrator must `sleep 3-5` before listing the run ID (see §11 "gh workflow run succeeds but no run appears"). The Monitor dispatch happens AFTER the run ID is captured — it does not need its own sleep.
