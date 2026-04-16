# CI/CD Integration - GitHub Actions

Guide for integrating KATA tests with GitHub Actions for continuous testing.

---

## 1. Overview

### Why CI/CD for Tests?

- **Fast Feedback**: Catch bugs before they reach production
- **Consistent Environment**: Same test results every time
- **Parallel Execution**: Run tests faster across multiple machines
- **Automated Reporting**: Results synced to TMS automatically
- **Quality Gates**: Block PRs that break tests

### CI/CD Strategy

| Trigger             | Tests to Run                 | Duration  | Purpose                               |
| ------------------- | ---------------------------- | --------- | ------------------------------------- |
| **On Pull Request** | Integration                  | 2-5 min   | Verify PR doesn't break functionality |
| **On Push to Main** | Integration + E2E (critical) | 5-10 min  | Ensure main branch is stable          |
| **Nightly**         | Full E2E suite               | 20-60 min | Comprehensive regression testing      |
| **On Release**      | Smoke tests                  | 2-3 min   | Verify deployment succeeded           |

---

## 2. GitHub Actions Setup

### 2.1 Workflow Files Structure

```
.github/
└── workflows/
    ├── test-pr.yml              # Run on pull requests
    ├── test-main.yml            # Run on push to main
    ├── test-nightly.yml         # Scheduled nightly tests
    └── test-release.yml         # Run on releases
```

### 2.2 Basic Workflow: Pull Request

**File: `.github/workflows/test-pr.yml`**

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
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install

      - name: Install Playwright browsers
        run: bunx playwright install --with-deps chromium

      - name: Run linting
        run: bun run lint

      - name: Run type checking
        run: bun run type-check

      - name: Run integration tests
        run: bun run test:integration
        env:
          TEST_ENV: ${{ vars.TEST_ENV }}
          API_BASE_URL: ${{ secrets.API_BASE_URL }}
          TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
          TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-results-pr
          path: |
            playwright-report/
            test-results/
          retention-days: 7

      - name: Comment PR with results
        if: always()
        uses: daun/playwright-report-comment@v3
        with:
          report-path: playwright-report/
```

### 2.3 Advanced Workflow: Main Branch (with E2E)

**File: `.github/workflows/test-main.yml`**

```yaml
name: Test - Main Branch

on:
  push:
    branches: [main]

jobs:
  integration:
    name: Integration Tests
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install

      - name: Install Playwright
        run: bunx playwright install --with-deps

      - name: Run integration tests
        run: bun run test:integration
        env:
          TEST_ENV: ${{ vars.TEST_ENV }}
          API_BASE_URL: ${{ secrets.API_BASE_URL }}
          TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
          TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-results-integration
          path: test-results/
          retention-days: 7

  e2e-critical:
    name: E2E - Critical Flows
    runs-on: ubuntu-latest
    needs: integration
    timeout-minutes: 15

    strategy:
      fail-fast: false
      matrix:
        browser: [chromium, firefox, webkit]

    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install

      - name: Install Playwright browsers
        run: bunx playwright install --with-deps ${{ matrix.browser }}

      - name: Run critical E2E tests
        run: bun run test:e2e:critical
        env:
          TEST_ENV: ${{ vars.TEST_ENV }}
          BASE_URL: ${{ secrets.BASE_URL }}
          API_BASE_URL: ${{ secrets.API_BASE_URL }}
          TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
          TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}

      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report-${{ matrix.browser }}
          path: playwright-report/
          retention-days: 7

      - name: Upload videos & traces
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-failures-${{ matrix.browser }}
          path: test-results/
          retention-days: 7

  sync-results:
    name: Sync Results to TMS
    runs-on: ubuntu-latest
    needs: [integration, e2e-critical]
    if: always()

    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2

      - name: Sync to TMS
        run: bun run test:sync
        env:
          AUTO_SYNC: true
          TMS_PROVIDER: xray
          XRAY_CLIENT_ID: ${{ secrets.XRAY_CLIENT_ID }}
          XRAY_CLIENT_SECRET: ${{ secrets.XRAY_CLIENT_SECRET }}
          BUILD_ID: ${{ github.run_id }}
```

### 2.4 Nightly Full Suite

**File: `.github/workflows/test-nightly.yml`**

```yaml
name: Test - Nightly Full Suite

on:
  schedule:
    - cron: '0 2 * * *' # Run at 2 AM UTC every day
  workflow_dispatch: # Allow manual trigger

jobs:
  full-e2e:
    name: Full E2E Suite
    runs-on: ubuntu-latest
    timeout-minutes: 60

    strategy:
      fail-fast: false
      matrix:
        browser: [chromium, firefox, webkit]
        shard: [1/4, 2/4, 3/4, 4/4]

    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install

      - name: Install Playwright browsers
        run: bunx playwright install --with-deps ${{ matrix.browser }}

      - name: Run full E2E suite (shard ${{ matrix.shard }})
        run: bun run test:e2e -- --shard=${{ matrix.shard }}
        env:
          TEST_ENV: ${{ vars.TEST_ENV }}
          BASE_URL: ${{ secrets.BASE_URL }}
          API_BASE_URL: ${{ secrets.API_BASE_URL }}
          TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
          TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}

      - name: Upload shard report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report-${{ matrix.browser }}-${{ strategy.job-index }}
          path: playwright-report/
          retention-days: 14

  merge-reports:
    name: Merge & Publish Reports
    runs-on: ubuntu-latest
    needs: full-e2e
    if: always()

    steps:
      - uses: actions/checkout@v4

      - name: Download all reports
        uses: actions/download-artifact@v4
        with:
          path: all-reports/

      - name: Merge Playwright reports
        run: bunx playwright merge-reports all-reports/

      - name: Publish report
        uses: actions/upload-artifact@v4
        with:
          name: nightly-full-report
          path: playwright-report/
          retention-days: 30

  notify-failures:
    name: Notify on Failures
    runs-on: ubuntu-latest
    needs: merge-reports
    if: failure()

    steps:
      - name: Send Slack notification
        uses: slackapi/slack-github-action@v1
        with:
          webhook-url: ${{ secrets.SLACK_WEBHOOK_URL }}
          payload: |
            {
              "text": "Nightly tests failed!",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Nightly E2E Tests Failed*\n<${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View Results>"
                  }
                }
              ]
            }
```

---

## 3. Playwright Configuration for CI

**File: `playwright.config.ts`**

```typescript
import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
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
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
```

---

## 4. Scripts Reference

```json
{
  "scripts": {
    "test": "playwright test",
    "test:integration": "playwright test --project=integration",
    "test:e2e": "playwright test --project=e2e",
    "test:e2e:critical": "playwright test --project=e2e --grep @critical",
    "test:sync": "bun run tests/utils/jiraSync.ts",
    "lint": "eslint .",
    "type-check": "tsc --noEmit"
  }
}
```

---

## 5. GitHub Secrets Configuration

Go to **Repository Settings → Secrets → Actions** and add:

| Secret Name          | Description                     | Example                           |
| -------------------- | ------------------------------- | --------------------------------- |
| `BASE_URL`           | Application base URL            | `https://staging.example.com`     |
| `API_BASE_URL`       | API base URL                    | `https://api.staging.example.com` |
| `TEST_USER_EMAIL`    | Test account email              | `test@example.com`                |
| `TEST_USER_PASSWORD` | Test account password           | `SecurePassword123!`              |
| `XRAY_CLIENT_ID`     | Xray Cloud client ID            | `abc123...`                       |
| `XRAY_CLIENT_SECRET` | Xray Cloud client secret        | `xyz789...`                       |
| `SLACK_WEBHOOK_URL`  | Slack webhook for notifications | `https://hooks.slack.com/...`     |

**Variables (non-secret):**

| Variable Name | Description          | Example   |
| ------------- | -------------------- | --------- |
| `TEST_ENV`    | Environment selector | `staging` |

---

## 6. Optimization Strategies

### 6.1 Sharding (Parallel Execution)

Run tests across multiple machines:

```yaml
strategy:
  matrix:
    shard: [1/4, 2/4, 3/4, 4/4]

steps:
  - run: bunx playwright test --shard=${{ matrix.shard }}
```

**Benefits:**

- 4x faster execution (4 shards)
- Each shard runs 1/4 of tests
- Results merged at the end

### 6.2 Dependency Caching

Cache `node_modules` and Playwright browsers:

```yaml
- uses: oven-sh/setup-bun@v2

- uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ runner.os }}-${{ hashFiles('bun.lockb') }}
```

**Savings**: ~2-3 minutes per run

### 6.3 Fail Fast Strategy

Stop all jobs if one critical test fails:

```yaml
strategy:
  fail-fast: true
  matrix:
    browser: [chromium, firefox, webkit]
```

### 6.4 Selective Test Running

Run tests only when relevant files change:

```yaml
on:
  pull_request:
    paths:
      - 'tests/**'
      - 'config/**'
      - '!docs/**'
```

---

## 7. Quality Gates

### 7.1 Block PR if Tests Fail

In **Repository Settings → Branches → Branch Protection Rules**:

- Require status checks to pass before merging
- Select: `Test - Pull Request / integration`
- Require branches to be up to date before merging

---

## 8. Monitoring & Alerts

### 8.1 Slack Notifications

Send test results to Slack:

```yaml
- name: Notify Slack
  if: failure()
  uses: slackapi/slack-github-action@v1
  with:
    webhook-url: ${{ secrets.SLACK_WEBHOOK_URL }}
    payload: |
      {
        "text": "Tests failed on main branch",
        "blocks": [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "*Test Failure*\nCommit: ${{ github.sha }}\nAuthor: ${{ github.actor }}\n<${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View Details>"
            }
          }
        ]
      }
```

### 8.2 Metrics Dashboard

Use **GitHub Actions Dashboard** or **Allure Reports** for trends:

- Pass rate over time
- Flaky tests identification
- Average execution time

---

## 9. Troubleshooting

### Issue: "Playwright browser installation failed"

**Solution**:

```yaml
- name: Install Playwright with deps
  run: bunx playwright install --with-deps chromium
```

### Issue: "Out of memory in CI"

**Solution**: Reduce workers

```typescript
workers: process.env.CI ? 1 : undefined;
```

### Issue: "Tests are flaky in CI"

**Solutions**:

1. Increase timeouts for CI:

   ```typescript
   timeout: isCI ? 60000 : 30000;
   ```

2. Enable retries:

   ```typescript
   retries: isCI ? 2 : 0;
   ```

3. Add wait conditions:

   ```typescript
   await page.waitForLoadState('networkidle');
   ```

### Issue: "Artifacts not uploaded"

**Solution**: Use `if: always()`

```yaml
- name: Upload artifacts
  if: always()
  uses: actions/upload-artifact@v4
```

---

## 10. Best Practices

### DO

- Run integration tests on every PR (fast feedback)
- Run E2E tests only on main branch and nightly
- Use sharding for large E2E suites
- Cache dependencies and browsers
- Upload artifacts (reports, videos, traces)
- Set up notifications for failures
- Use quality gates (block PRs with failures)

### DON'T

- Run full E2E suite on every PR (too slow)
- Ignore flaky tests (fix them!)
- Skip cleanup (test data pollution)
- Run tests without retries in CI
- Upload sensitive data in artifacts

---

## 11. References

- **GitHub Actions**: https://docs.github.com/en/actions
- **Playwright CI**: https://playwright.dev/docs/ci
- **Sharding**: https://playwright.dev/docs/test-sharding
- **Bun Setup Action**: https://github.com/oven-sh/setup-bun
