# CI Integration — Playwright Config, Reporters, Projects

Load when authoring or modifying `playwright.config.ts`, wiring a new reporter, tuning parallelism / sharding while authoring, or debugging why a test behaves differently locally versus in CI. This file is scoped to **Playwright-level** concerns — config, reporters, projects, sharding, environment propagation.

Regression / smoke orchestration (GitHub Actions workflows, `gh run watch`, failure triage, release GO/NO-GO) is out of scope. That belongs to the `regression-testing` skill. If you are building the pipeline that runs these suites on a schedule or on PRs, start there.

---

## 1. `playwright.config.ts` — canonical shape

The config has four load-bearing concerns: **projects**, **reporters**, **use** (global defaults), and **CI-vs-local switches**. Everything else is derived from these.

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
    ['./tests/KataReporter.ts'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['allure-playwright', { outputFolder: 'allure-results' }],
    ['json', { outputFile: 'test-results/results.json' }],
    isCI ? ['github'] : ['list'],
  ],

  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: isCI ? 'retain-on-failure' : 'on-first-retry',
    screenshot: 'only-on-failure',
    video: isCI ? 'retain-on-failure' : 'off',
  },

  projects: [
    { name: 'global-setup', testMatch: /global\.setup\.ts/ },

    { name: 'api-setup',
      testMatch: /api-auth\.setup\.ts/,
      dependencies: ['global-setup'] },

    { name: 'ui-setup',
      testMatch: /ui-auth\.setup\.ts/,
      dependencies: ['global-setup'] },

    { name: 'integration',
      testDir: './tests/integration',
      dependencies: ['api-setup'],
      use: { storageState: '.auth/api-state.json' } },

    { name: 'e2e',
      testDir: './tests/e2e',
      dependencies: ['ui-setup'],
      use: { ...devices['Desktop Chrome'], storageState: '.auth/user.json' } },
  ],

  globalTeardown: './tests/teardown/global.teardown.ts',
});
```

Rules this template encodes:

- **One `testDir` per project** — do not point two projects at the same folder with different filters. Use `--grep` at the command line for ad-hoc selection.
- **Authentication via setup projects** — projects that need a logged-in state depend on `ui-setup` or `api-setup` and consume the generated `storageState` file. Do not login in `beforeEach` of every test.
- **`forbidOnly: isCI`** — `test.only` is legal locally (fast iteration) but fails the build on CI. Catches accidental commits.
- **`fullyParallel: true`** — every test file can run concurrently with every other. If a test depends on order, the test is wrong.

---

## 2. Projects dependency graph

The setup projects gate the test projects. Visualised:

```
global-setup
 ├── ui-setup  ──► e2e
 └── api-setup ──► integration
                                    (both → global-teardown)
```

### 2.1 Generated auth artifacts

```
.auth/
├── user.json          storageState for E2E (cookies + localStorage)
└── api-state.json     JWT token + user metadata for integration tests
```

`.auth/` is gitignored. On a fresh checkout, the setup projects must run before either test project — which is exactly what the dependency chain encodes. If a contributor tries to run `bun run test:e2e` without authenticating, Playwright will invoke `ui-setup` automatically because of the `dependencies` array.

### 2.2 Project-scoped `use`

Per-project `use` overrides global `use`. Common pattern: E2E sets `storageState`, integration does not. Desktop Chrome devices, viewports, and locale overrides also belong at the project level — never in individual tests.

---

## 3. Reporter chain — order matters

The reporter array is load-bearing. Reporters run in order and the first one can mutate timing metrics for the rest. The canonical order is:

1. **`KataReporter`** (custom) — colored terminal tree, prints step boundaries, reads the NDJSON written by `@atc` to show per-ATC status. Goes first so its step events are registered before Allure grabs them.
2. **`html`** — Playwright's built-in HTML report. Lives in `playwright-report/`. `open: 'never'` prevents it from auto-opening locally (annoying in CI-like local runs).
3. **`allure-playwright`** — writes `allure-results/`. The `bun run test:allure` script post-processes this directory into a static site.
4. **`json`** — machine-readable summary for tooling (`test-results/results.json`).
5. **`github` / `list`** — the environment-dependent human reporter. `github` annotates PRs with failure locations when run in GitHub Actions. `list` is cleaner locally.

### 3.1 What `KataReporter` produces

Terminal output only. It reads `step.category === 'test.step'` events from Playwright and prints a nested tree:

```
🧪 Running Test [3/6] => UPEX-100: should be able to re-authenticate
    ---- ✓ ATC [PROJ-101]: authenticateSuccessfully({ email: "user@test.com", password: "***" })
    ---- API OK: 200 - https://api.example.com/auth/login
    ✅ [PROJ-101] authenticateSuccessfully - PASS (825ms)
```

The final `atc_results.json` aggregation is written in `KataReporter.onEnd()`, not during individual tests — see the tracing reference for the pipeline.

### 3.2 Allure attachments

`ApiBase` attaches every request/response pair to Allure automatically. `@atc` adds `allure.label`, `allure.severity`, `allure.link` based on the decorator argument. There is no manual `testInfo.attach()` or `allure.step()` needed in a well-written component — if you see them, flag in review.

### 3.3 Artifact output paths

| Artifact | Path | When |
|----------|------|------|
| HTML report | `playwright-report/` | Every run |
| JSON summary | `test-results/results.json` | Every run |
| JUnit XML (if enabled) | `test-results/junit-results.xml` | Every run |
| Allure raw | `allure-results/` | Every run |
| Traces | `test-results/{test}/trace.zip` | Per `trace` setting |
| Screenshots on failure | `test-results/{test}/test-failed-*.png` | On failure |
| Videos on failure | `test-results/{test}/video.webm` | Per `video` setting |
| NDJSON partial | `reports/.atc_partial.ndjson` | During run, deleted in `onEnd()` |
| Aggregated ATC results | `reports/atc_results.json` | After `KataReporter.onEnd()` |

All paths except `reports/atc_results.json` should be gitignored.

---

## 4. Local vs CI configuration differences

Deliberate divergence. Each switch has a reason.

| Setting | Local | CI | Reason |
|---------|-------|-----|--------|
| `retries` | `0` | `2` | Local: surface flakiness immediately. CI: tolerate infra jitter but still count retries as flags. |
| `workers` | `undefined` (auto) | `1` | Local: use all cores for fast feedback. CI: predictable resource usage on shared runners; trade parallelism for stability. |
| `forbidOnly` | `false` | `true` | Let devs iterate with `.only`, block it on merge. |
| `trace` | `'on-first-retry'` | `'retain-on-failure'` | Local: keep disk light. CI: always capture failures for postmortem. |
| `video` | `'off'` | `'retain-on-failure'` | Same rationale. |
| `reporter` tail | `['list']` | `['github']` | `github` writes PR annotations. `list` is the compact human view. |
| `timeout` (test) | project default | project default + small CI multiplier (optional) | Networks are slower on CI runners. Keep deltas small. |

### 4.1 The `retries: 0` local rule

This is a discipline, not a constraint. If a test passes on retry locally, it is flaky — the failure you will chase later is already in your diff. CI keeps `retries: 2` to tolerate transient infrastructure issues, but any test that consistently needs a retry to pass in CI is promoted to a flakiness bug, not accepted.

### 4.2 CI detection

`!!process.env.CI` is the single switch. GitHub Actions, GitLab CI, CircleCI, Jenkins, and Buildkite all set `CI=true`. Do not check `process.env.GITHUB_ACTIONS` or other provider-specific variables inside the Playwright config — the config must stay provider-agnostic.

---

## 5. Environment variables the config reads

The config reads through `config/variables.ts`, the single source of truth. It does not read `process.env` ad-hoc.

| Env var | Consumed by | Purpose |
|---------|-------------|---------|
| `CI` | Playwright config | Toggle local vs CI switches |
| `BASE_URL` | `use.baseURL` | Frontend URL — overridden per environment |
| `API_BASE_URL` | `ApiBase` | API host |
| `LOCAL_USER_EMAIL` / `LOCAL_USER_PASSWORD` | auth setup projects | Local credentials |
| `STAGING_USER_EMAIL` / `STAGING_USER_PASSWORD` | auth setup projects | Staging credentials |
| `TEST_ENV` | `config/variables.ts` | Selector for which credential set to use |
| `AUTO_SYNC` | `global.teardown.ts` | Enable TMS sync (see atc-tracing reference) |
| `TMS_PROVIDER` | `jiraSync.ts` | `xray` / `jira` / `none` |

### 5.1 Rules

- **Never hardcode credentials** anywhere in the repo — `.env` only. Rejected at review.
- **Never read `process.env` inside an ATC** — route through `@variables`. Keeps component code portable.
- **`.env.example` is the contract** — every new variable must be added there with a placeholder; missing rows break onboarding.

---

## 6. Sharding and parallelism — while authoring

The project-level sharding used in CI pipelines is out of scope here. This section covers what you do **locally** while authoring and debugging.

### 6.1 Parallelism tuning

- **Default**: `fullyParallel: true` + `workers: undefined` → Playwright uses `os.cpus().length / 2`.
- **Authoring a new suite**: run with `workers: 1` to make the terminal output readable and to catch accidental shared-state bugs.
  ```bash
  bun run test tests/integration/orders/createOrder.test.ts -- --workers=1
  ```
- **Stress-testing for flakiness**: run with higher parallelism than CI uses.
  ```bash
  bun run test -- --workers=8 --repeat-each=5
  ```

### 6.2 Sharding while authoring

Use sharding locally only when debugging CI-style execution order. Two-shard split:

```bash
bunx playwright test --shard=1/2
bunx playwright test --shard=2/2
```

Each shard gets a deterministic subset of the test files — useful for reproducing a "test fails only in shard 2" issue. The global `--shard` flag is orthogonal to `--project`: you can shard a single project with `--project=integration --shard=1/2`.

### 6.3 Merging reports from local shards

```bash
bunx playwright merge-reports --reporter=html ./blob-report
```

Required only if you set `reporter: 'blob'` per shard. Normal authoring loops do not need this.

---

## 7. Command cheatsheet

### 7.1 Running tests

```bash
# Run everything (all projects)
bun run test

# Run a single project
bun run test -- --project=integration
bun run test -- --project=e2e

# Run a single file
bun run test tests/integration/orders/createOrder.test.ts

# Run by tag
bun run test -- --grep @smoke
bun run test -- --grep "@critical|@regression"
bun run test -- --grep-invert @flaky

# Run a single test title
bun run test -- --grep "PROJ-101: should login"

# UI mode (interactive watcher)
bun run test:ui

# Debug mode (opens inspector)
bun run test -- --debug tests/e2e/login/login.test.ts

# Headed mode
bun run test -- --headed

# Specific browser at runtime (overrides project device)
bun run test -- --project=e2e --browser=firefox
```

### 7.2 Reports

```bash
# Open the HTML report from the last run
bunx playwright show-report

# Generate Allure site from allure-results/
bun run test:allure

# Produce kata-manifest.json (static registry of components / ATCs)
bun run kata:manifest

# Sync OpenAPI + regenerate types
bun run api:sync
```

### 7.3 Quality loop (local, before PR)

```bash
bun run test <path>         # 1. does the new test pass?
bun run type-check          # 2. no TS errors
bun run lint                # 3. no lint errors
bun run kata:manifest       # 4. registry updated, ATCs visible
```

Run in order. Do not chase lint errors before tests pass — the failing test may delete the offending code.

---

## 8. Gotchas

1. **Dependency projects do not re-run between test projects.** `ui-setup` runs once per invocation. If you change auth credentials mid-session, invalidate `.auth/` manually (`rm -rf .auth`).
2. **`fullyParallel: true` is strict.** A test that works serially but fails in parallel has shared state — locate it and remove it; do not reach for `test.describe.serial`.
3. **Project `testMatch` is case-sensitive on Linux, case-insensitive on macOS.** CI is Linux. Match the pattern exactly on disk.
4. **`globalTeardown` runs even if all tests were skipped.** Use it for artifact cleanup and for the TMS sync gate (which has its own `if (AUTO_SYNC)` guard).
5. **The `baseURL` applies to `page.goto('/path')` only.** API requests go through `ApiBase` which has its own `API_BASE_URL`. They are independent.
6. **Reporter order is preserved.** Moving `html` before `KataReporter` can cause the tree view to miss step events on fast tests. Keep `KataReporter` first.
7. **`retries: 2` in CI is not an invitation to write flaky tests.** Retries mask infra jitter, not product bugs. A test that only passes on retry is still a bug.
8. **Setup projects produce side effects** (`.auth/*.json`, `reports/.atc_partial.ndjson`). Do not commit these. `.gitignore` covers them; do not weaken it.

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Tests pass locally, fail in CI with timeout | CI runner slower than local; insufficient waits | Add condition-based waits; do not bump the global timeout |
| "forbidOnly" failure in CI | Left a `test.only` in the diff | Remove it; CI is protecting `main` |
| Auth state missing in CI | Setup project did not run | Check `dependencies` chain; verify `.auth/` is not pre-existing from a previous run in cached workspaces |
| Allure report empty | `allure-results/` not produced | Check `allure-playwright` is registered in `reporter`; verify `outputFolder` option |
| Different browser runs different test set | One project has `testMatch` the other does not | Align `testDir` and `testMatch` per project |
| `kata-manifest.json` missing an ATC | `@atc` uses a template literal or variable | Decorator scanner requires a string literal — `@atc('PROJ-101')` |
| Storage state rejected — "token expired" | `.auth/api-state.json` stale | Delete `.auth/`, rerun; or shorten setup token TTL handling |
| Tests that pass on retry | Hidden race condition | Fix the race; do not rely on `retries` |

---

## 10. Out of scope — handoff to `regression-testing`

The following belong to the regression-testing skill, not here:

- GitHub Actions workflow YAML (PR / main / nightly / release triggers)
- `gh run list`, `gh run watch`, `gh run view --log-failed`
- Allure report hosting / publishing pipelines
- Slack / email failure notifications
- Regression GO/NO-GO analysis
- Flakiness classification across runs
- Test sharding matrices for nightly suites
- Secret management beyond "names and purposes of variables the config reads"

If the task at hand is "run the regression suite in CI and analyse the result", start at `regression-testing`. If it is "configure Playwright so regression can run it consistently", stay here.
