# CI/CD Integration — GitHub Actions for Regression Testing

Read this when configuring new workflows, modifying existing ones, debugging CI-only failures, tuning sharding or retries, wiring secrets, or optimizing execution time.

---

## 1. Strategy matrix

| Trigger | Tests | Duration | Purpose |
|---------|-------|----------|---------|
| Pull request (`build.yml`) | Static checks + compile only — no test execution | 2-5 min | Block PRs that break the framework build |
| Daily 00:00 UTC (`regression.yml`) | Full suite: integration + E2E, Allure report | 20-60 min | Regression + trend data |
| Daily 02:00 UTC (`smoke.yml`) | `@critical` smoke project | 2-5 min | Environment heartbeat |
| Manual (`sanity.yml`) | Targeted subset (`grep` \| `test_file`) | varies | Verify a fix or a suspect area |

Do NOT run the full E2E suite on every PR — it is too slow and costly. Do NOT ignore flaky tests — fix them.

---

## 2. Workflow file layout

The shipped workflows — read the real files, never quote them from memory (Critical Rule #11 applies to workflows just as much as scripts):

```
.github/workflows/
├── build.yml            On: pull_request → main            → TestBuild checks: env check, types, lint, playwright --list (no test execution)
├── regression.yml       On: schedule (daily 00:00 UTC) + workflow_dispatch → full regression (integration + e2e jobs, merged Allure report)
├── smoke.yml            On: schedule (daily 02:00 UTC) + workflow_dispatch → @critical smoke suite
├── sanity.yml           On: workflow_dispatch              → targeted run (grep | test_file inputs)
├── pages.yml            On: push to main + workflow_dispatch → GitHub Pages docs hub deploy
└── pages-squash.yml     On: schedule (monthly) + workflow_dispatch → squash Pages branch history
```

The three test workflows with `workflow_dispatch` (`regression`, `smoke`, `sanity`) are what the regression-testing skill triggers via `gh workflow run`. The two `pages-*` workflows are report/docs plumbing, not test suites.

---

## 3. PR workflow — the shipped `build.yml` (framework validation, no test execution)

The shipped PR gate deliberately runs NO tests. It validates that the framework compiles and passes static checks — a smoke test for the test framework itself:

```yaml
name: TestBuild Checks
on:
  pull_request:
    branches:
      - main

env:
  CI: true
  TEST_ENV: 'staging'
  STAGING_USER_EMAIL: ${{ secrets.STAGING_USER_EMAIL }}
  STAGING_USER_PASSWORD: ${{ secrets.STAGING_USER_PASSWORD }}

jobs:
  TestBuild:
    name: Framework Validation
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 1
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run test:env:check     # validates env configuration
      - run: bun run types:check
      - run: bun run lint:check
      - run: bunx playwright test --list   # compile check — lists tests without running them
```

Key points:
- No test execution on PRs — actual suite runs live in the scheduled `regression.yml` / `smoke.yml` and the manual `sanity.yml`.
- Credentials are the env-prefixed pair for the selected `TEST_ENV` (`STAGING_USER_EMAIL` / `STAGING_USER_PASSWORD`), needed only so `test:env:check` and config resolution pass. URLs are NOT secrets — they resolve from `.agents/project.yaml` via `config/variables.ts`.
- `bunx playwright test --list` catches broken imports and type errors in specs without spending CI minutes on browsers.

---

## 4. Daily regression — the shipped `regression.yml`

Runs daily at 00:00 UTC and on `workflow_dispatch` (with `environment` and `generate_allure` inputs). Read the real file — this is the shape, not a copy:

```
regression.yml
├── env: TEST_ENV = inputs.environment || 'staging'
│        LOCAL_USER_EMAIL / LOCAL_USER_PASSWORD       (secrets)
│        STAGING_USER_EMAIL / STAGING_USER_PASSWORD   (secrets)
│        TMS_PROVIDER = vars.TMS_PROVIDER || 'xray'   (repo VARIABLE, not a secret)
│        AUTO_SYNC + XRAY_CLIENT_ID / XRAY_CLIENT_SECRET (TMS sync, optional)
│        STP_EXECUTION_KEY                            (secret — the STR's key)
├── job: integration   → bun run test:integration  → uploads integration-allure-results + integration-test-results
├── job: e2e           → bun run test:e2e          → uploads e2e-allure-results + e2e-test-results
├── job: allure-report (if: always, unless generate_allure=false)
│       merges both allure-results dirs → merged-allure-results-<TEST_ENV>
│       generates + publishes the Allure report (same allurerc.mjs as local runs)
└── job: XrayImport   (if: always() && vars.TMS_PROVIDER == 'xray', continue-on-error)
        downloads the *-test-results artifacts → [TMS_TOOL] JUnit import into $STP_EXECUTION_KEY
        skips with an annotation when AUTO_SYNC != 'true', Xray creds are missing,
        or STP_EXECUTION_KEY is unset; a jira-native repo skips the job silently
```

Key points:
- Credentials are the env-prefixed pairs (`LOCAL_*` / `STAGING_*`) matching `config/variables.ts` — there are no `TEST_USER_*` secrets, and no URL secrets: `config.baseUrl` resolves from `.agents/project.yaml` by `TEST_ENV`.
- TMS sync (Xray) runs off `AUTO_SYNC` + `XRAY_CLIENT_ID` / `XRAY_CLIENT_SECRET`; the Jira-Direct alternative uses `ATLASSIAN_EMAIL` / `ATLASSIAN_API_TOKEN` (present in the file, commented until enabled).
- **The write-back leg is the `XrayImport` job**, gated on `TMS_PROVIDER` (a repo VARIABLE — a job-level `if:` can read `vars` but never `secrets`). It runs `if: always()` so a failing suite still reports its results, and `continue-on-error` so a TMS outage never turns a green suite red. `STP_EXECUTION_KEY` names the **STR** Test Execution the JUnit reports import into — never the STP itself; unset means the job skips with a warning annotation rather than minting an orphan Execution.
- The `allure-report` job runs `if: always()` so failures still produce a report; the Slack failure notification block exists but ships commented out.
- The artifact name the analysis phase downloads is `merged-allure-results-<TEST_ENV>`.

---

## 5. Smoke + sanity — the shipped `smoke.yml` and `sanity.yml`

**`smoke.yml`** — daily at 02:00 UTC and on `workflow_dispatch` (`environment` input):

- Same env block as regression (`TEST_ENV` selector + `LOCAL_*` / `STAGING_*` credential secrets).
- Single job: `bun run pw:install` → `bun run test:smoke` (the `smoke` Playwright project — `@critical` tagged tests across e2e + integration).
- Publishes its Allure report per environment; the run summary prints the published URL (`.../<TEST_ENV>/smoke/`).

**`sanity.yml`** — `workflow_dispatch` only, with inputs for `environment`, test type, `grep`, and `test_file`:

- Routes to `bun run test`, `bun run test:e2e`, or `bun run test:integration` with the optional `--grep` filter, or runs a single `test_file`.
- `grep` and `test_file` are mutually exclusive — passing both silently ignores one (see the skill's Gotchas).
- Uploads `sanity-playwright-report` + test-results artifacts; report publishing supports both the private Portal and GitHub Pages paths.

Neither shipped suite uses sharding or a multi-browser matrix today — the suite runs single-worker (see §6). The sharding recipes in §9 are the scaling path for a downstream project whose suite outgrows one runner.

---

## 6. Playwright config for CI

The shipped `playwright.config.ts` is the source of truth — read it, don't quote it from memory. The load-bearing choices:

```typescript
import { defineConfig, devices } from '@playwright/test';
import { config, env } from './config/variables';

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.test\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,   // Fail the build if someone committed test.only()

  // KATA Recommendation: Avoid retries - tests should be deterministic
  // If a test fails, investigate immediately rather than masking with retries
  retries: 0,

  // Single worker for now - increase when tests are stable and parallelizable
  workers: 1,

  reporter: [
    ['./tests/KataReporter.ts'],   // rich terminal output, local + CI
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['allure-playwright', { resultsDir: config.reporting.allureResultsDir, /* ... */ }],
  ],
  use: {
    baseURL: config.baseUrl,   // resolved from .agents/project.yaml by TEST_ENV — never a BASE_URL env secret
    trace: env.isCI ? 'retain-on-failure' : 'on-first-retry',
    screenshot: config.reporting.screenshotOnFailure ? 'only-on-failure' : 'off',
    video: env.isCI && config.reporting.videoOnFailure ? 'retain-on-failure' : 'off',
  },
  projects: [
    // global-setup → ui-setup / api-setup → e2e | integration | smoke → global-teardown
    // (dependency-chained projects; see the real file for the full list, incl. sandbox)
  ],
});
```

Rules:
- `forbidOnly` in CI — non-negotiable. Prevents test.only() slipping into main.
- `retries: 0` **everywhere, local and CI** — tests must be deterministic. A retry does not fix a flake, it hides it; the failure surfaces immediately and gets investigated, and the classification phase never has to unmask retry-passes.
- `workers: 1` + `fullyParallel: false` — the shipped suite runs serially. Raise parallelism only when tests are proven independent; scale via workflow-level sharding (§9) before per-runner workers.
- No `process.env` reads in the config: everything routes through `config/variables.ts` (single source of truth; URLs from `.agents/project.yaml`, credentials from env-prefixed `LOCAL_*` / `STAGING_*` vars).

> **Conscious divergence: enabling retries.** Some downstream projects deliberately set
> `retries: 1-2` in CI to stabilize a large legacy suite while it is being cleaned up. If
> you make that call, own its consequences: (1) a green run no longer means a stable
> suite — a test that passes on retry is still flaky; (2) the Analyze phase MUST read
> Allure's retry data (`retriesCount > 0` on a `passed` result = a flake observation)
> and count retry-passes in the flakiness numerator —
> `effective_failure_rate = (failed + retried_passes) / total`
> (see `failure-classification.md` §5 "Retry-aware flakiness"); (3) `trace:
> 'on-first-retry'` starts earning its keep in CI too. Record the decision as an ADR
> (`.context/ADR/`) — it is a flake-policy decision. With the shipped `retries: 0`, none
> of this machinery applies: a retry-pass signal cannot occur.

---

## 7. package.json scripts

**Read `package.json` directly before quoting any command** (Critical Rule #11) — script names drift, and this doc will not be updated in lockstep. The names CI leans on today:

| Script | Role in CI |
|--------|-----------|
| `test` / `test:e2e` / `test:integration` | Full run / `e2e` project / `integration` project |
| `test:smoke` | `smoke` project (`@critical` grep across e2e + integration) |
| `test:env:check` | Validates env configuration before any suite runs |
| `test:sync` | TMS results sync (`tests/utils/jiraSync.ts`) |
| `lint:check` / `types:check` | Static gates in `build.yml` |
| `pw:install` | `playwright install --with-deps chromium` |

Exact commands, flags, and the rest of the script catalogue: open `package.json`.

---

## 8. Secrets and variables

Repository Settings → Secrets → Actions (the names match `config/variables.ts` — env-prefixed credentials, one pair per environment):

| Secret | Value |
|--------|-------|
| `LOCAL_USER_EMAIL` / `LOCAL_USER_PASSWORD` | Test account for `TEST_ENV=local` |
| `STAGING_USER_EMAIL` / `STAGING_USER_PASSWORD` | Test account for `TEST_ENV=staging` |
| `AUTO_SYNC` | Master switch for the TMS write-back — `'true'` to enable. Absent/anything else = every suite runs with sync off (the workflow defaults it to `'false'`) |
| `STP_EXECUTION_KEY` | Key of the **STR** — the Test Execution linked to the sprint's STP, filed under the `QA Test Artifacts` epic. **NOT the STP's own key**: a Test Plan derives its status from Executions and is never written into, so CI refuses to import without a real Execution key and skips with a warning |
| `XRAY_CLIENT_ID` / `XRAY_CLIENT_SECRET` | Xray Cloud API credentials (TMS sync, Modality jira-xray) |
| `ATLASSIAN_EMAIL` / `ATLASSIAN_API_TOKEN` | Jira-Direct TMS sync alternative (commented in the workflows until enabled) |
| `PORTAL_URL` / `PORTAL_PROJECT` / `PORTAL_API_KEY`, `R2_*` | Private report portal publishing (optional; see `references/private-hosting-setup.md`) |

### Variables (not secrets)

Repository Settings → Secrets and variables → Actions → **Variables** tab:

| Variable | Value |
|----------|-------|
| `TMS_PROVIDER` | `xray` (default when unset) / `jira` / `none`. It must be a VARIABLE because the `XrayImport` job gates on it in a job-level `if:`, and that context can read `vars` but never `secrets` |

`bun run setup --variables` **cannot** push this one: that path only writes secrets (`cli/lib/variables-flow.ts` has no `gh variable set`). Set `TMS_PROVIDER` by hand in Settings → Secrets and variables → Actions → Variables.

There is **no `BASE_URL` / `API_BASE_URL` secret and no `TEST_USER_*` pair**: URLs are not secrets — they resolve from the versioned `.agents/project.yaml` through `config/variables.ts`, selected by `TEST_ENV`.

`TEST_ENV` itself is not a stored variable either: the workflows derive it from the `environment` dispatch input, defaulting to `staging`.

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
    key: playwright-${{ runner.os }}-${{ hashFiles('bun.lock') }}
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
- Select: `TestBuild Checks / Framework Validation` (the `build.yml` job).
- Require branches to be up to date before merging.

Result: no PR merges to `main` with red integration tests.

---

## 11. Troubleshooting CI-only failures

### "Playwright browser installation failed"
Use `bunx playwright install --with-deps chromium`. The `--with-deps` flag installs system libraries.

### "Out of memory in CI"
The shipped config already runs `workers: 1`. If a downstream project raised it, drop it back down — and shard at the workflow level (§9) instead of stacking workers on one runner.

### "Tests flaky in CI, pass locally"
Two knobs, in order:
1. Bump timeouts: the shipped config uses `timeout: 60000` with a 10s `expect` timeout — widen per-test with `test.slow()` before touching globals.
2. Add explicit waits on navigations: `await page.waitForLoadState('networkidle')` (or, better, a deterministic `waitForResponse` on the request the page depends on).

Do NOT reach for retries — the doctrine is `retries: 0` (a retry hides the flake; see §6). If the test still fails intermittently after real waits, it is genuinely flaky — surface it in the Analyze phase and schedule stabilization.

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
- Run the build checks (`build.yml`) on every PR — fast feedback without spending CI minutes on suites.
- Let the scheduled `regression.yml` + `smoke.yml` carry suite execution; use `sanity.yml` for targeted verification.
- Use sharding for any E2E suite > 10 minutes.
- Cache `~/.cache/ms-playwright` and `node_modules`.
- Always upload artifacts with `if: always()`.
- Notify Slack on nightly failures only (PR noise is counterproductive).
- Keep secrets out of logs — `::add-mask::` if you must echo them.

### Don't
- Run full E2E on every PR.
- Ignore flaky tests — either fix or quarantine with a tracking ticket.
- Skip cleanup between runs (test data pollution accumulates).
- Enable retries to "stabilize" the pipeline — the shipped doctrine is `retries: 0` (deterministic tests; a retry hides the flake). Diverge only consciously, per the divergence box in §6.
- Upload sensitive data in artifacts (screenshots can contain PII).
- Hard-code credentials in workflow YAML.

---

## 13. Monitoring the workflow run (Background dispatch)

The CI run is long (20-60 min). Blocking the main thread on `gh run watch` is wasteful — we delegate to a Monitor subagent and continue with preparation work in the main thread. This section is the canonical reference for the dispatch declared in `regression-testing/SKILL.md` §"Subagent Dispatch Strategy" → "Wait/monitor `gh run watch`" row.

**When to use**: every time we trigger a regression workflow that takes >5 min. (For `smoke` (2-5 min) the dispatch overhead is borderline; classify by actual wall time, not workflow name.)

**Dispatch (Background pattern)**:

Briefing (follows the 7-component format from `agentic-qa-core/references/briefing-template.md`):

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
