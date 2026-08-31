# CI Integration — Playwright Config, Reporters, Projects

Load when authoring or modifying `playwright.config.ts`, wiring a new reporter, tuning parallelism / sharding while authoring, or debugging why a test behaves differently locally versus in CI. This file is scoped to **Playwright-level** concerns — config, reporters, projects, sharding, environment propagation.

Regression / smoke orchestration (GitHub Actions workflows, `gh run watch`, failure triage, release GO/NO-GO) is out of scope. That belongs to the `regression-testing` skill. If you are building the pipeline that runs these suites on a schedule or on PRs, start there.

---

## 1. `playwright.config.ts` — canonical shape

The config has four load-bearing concerns: **projects**, **reporters**, **use** (global defaults), and **CI-vs-local switches**. Everything else is derived from these.

```typescript
import { defineConfig, devices } from '@playwright/test';
import { config, env } from './config/variables';

// Single source of truth — the config NEVER reads process.env directly
const baseURL = config.baseUrl;

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.test\.ts/,

  fullyParallel: false,
  forbidOnly: !!process.env.CI,

  // KATA doctrine: tests must be deterministic. A failure is investigated,
  // never masked by a retry — locally AND in CI.
  retries: 0,

  // Single worker for now — increase when tests are stable and parallelizable
  workers: 1,

  reporter: [
    ['./tests/KataReporter.ts'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['allure-playwright', { resultsDir: config.reporting.allureResultsDir /* + detail, categories, environmentInfo */ }],
  ],

  use: {
    baseURL,
    trace: env.isCI ? 'retain-on-failure' : 'on-first-retry',
    screenshot: config.reporting.screenshotOnFailure ? 'only-on-failure' : 'off',
    video: env.isCI && config.reporting.videoOnFailure ? 'retain-on-failure' : 'off',
    headless: env.isCI || config.browser.headless,
  },

  projects: [
    { name: 'global-setup',
      testMatch: /global\.setup\.ts/,
      testDir: './tests/setup',
      teardown: 'global-teardown' },   // teardown wired as a PROJECT, not a globalTeardown hook

    { name: 'ui-setup',
      testMatch: /ui-auth\.setup\.ts/,
      testDir: './tests/setup',
      dependencies: ['global-setup'] },

    { name: 'api-setup',
      testMatch: /api-auth\.setup\.ts/,
      testDir: './tests/setup',
      dependencies: ['global-setup'] },

    { name: 'e2e',
      testMatch: '**/e2e/**/*.test.ts',
      dependencies: ['ui-setup'],
      use: { ...devices['Desktop Chrome'], storageState: config.auth.storageStatePath } },

    { name: 'integration',
      testMatch: '**/integration/**/*.test.ts',
      dependencies: ['api-setup'],
      use: {} },

    { name: 'smoke',
      grep: /@critical/,
      testMatch: '**/{e2e,integration}/**/*.test.ts',
      dependencies: ['ui-setup', 'api-setup'],
      use: { ...devices['Desktop Chrome'], storageState: config.auth.storageStatePath } },

    { name: 'global-teardown',
      testMatch: /global\.teardown\.ts/,
      testDir: './tests/teardown' },
  ],

  outputDir: 'test-results',
});
```

Rules this template encodes:

- **URLs come from `config/variables.ts`** — the config imports `config` / `env` and never reads `process.env` ad-hoc (single exception: the `CI` flag). See §5.
- **`testMatch: /.*\.test\.ts/`** — only `*.test.ts` files run. A `*.spec.ts` file is silently ignored; name test files accordingly.
- **Authentication via setup projects** — projects that need a logged-in state depend on `ui-setup` or `api-setup` and consume the generated `storageState` file. Do not login in `beforeEach` of every test.
- **`forbidOnly: !!process.env.CI`** — `test.only` is legal locally (fast iteration) but fails the build on CI. Catches accidental commits.
- **`retries: 0` everywhere** — locally and in CI. Tests are deterministic by doctrine; a failure is a signal to investigate, never something to mask with a retry.
- **Serial execution is the shipped default** — `fullyParallel: false` + `workers: 1`. Parallelism is a deliberate future upgrade once the suite is proven stable, not a knob to flip casually.
- **Teardown is a PROJECT** — `global-teardown` is activated by the `teardown:` property on `global-setup`, not by a `globalTeardown` hook and not by `dependencies`.

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
3. **`json`** — machine-readable summary for tooling (`test-results/results.json`).
4. **`junit`** — XML for CI tools (`test-results/junit.xml`). Always on, local and CI.
5. **`allure-playwright`** — writes to `config.reporting.allureResultsDir`. The `bun run allure:generate` script post-processes this directory into a static site.
6. **`github`** (optional, commented out in the shipped config) — annotates PRs with failure locations when enabled in GitHub Actions. Not recommended with matrix strategies (errors multiply in the UI).

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

### 3.2.1 Allure suite labels — single source of truth (Playwright tags)

Allure suite / grouping labels are **derived from the Playwright tag** on the test — there is no separate Allure label taxonomy to maintain. The `@smoke` / `@regression` / `@e2e` / `@integration` / `@critical` tag is the **single source of truth**: it drives BOTH CI scope selection (`--grep @smoke`) AND Allure suite grouping. A test tagged `@integration` lands in the Allure `integration` suite/label automatically — do not add a duplicate Allure label for the same grouping.

- **One tag, two consumers.** The same tag the CI workflow greps on is the tag Allure groups by. Never label a test `@integration` for grep and then hand-set a different Allure suite — they must agree by construction because they are the same string.
- **No parallel taxonomy.** Do not invent Allure-only suite names. If a new grouping is needed, add it as a Playwright tag (so CI can select it) and let Allure inherit it.
- **Where it is consumed downstream:** `regression-testing` reads the `suite` label off each Allure result during failure analysis — see `regression-testing/SKILL.md` (Phase 2 §Parse results). Because the label is tag-derived, the suite shown in a regression report is exactly the scope CI ran.

### 3.3 Artifact output paths

| Artifact | Path | When |
|----------|------|------|
| HTML report | `playwright-report/` | Every run |
| JSON summary | `test-results/results.json` | Every run |
| JUnit XML | `test-results/junit.xml` | Every run |
| Allure raw | `allure-results/` | Every run |
| Traces | `test-results/{test}/trace.zip` | Per `trace` setting |
| Screenshots on failure | `test-results/{test}/test-failed-*.png` | On failure |
| Videos on failure | `test-results/{test}/video.webm` | Per `video` setting |
| NDJSON partial | `reports/.atc_partial.ndjson` | During run, deleted in `onEnd()` |
| Aggregated ATC results | `reports/atc_results.json` | After `KataReporter.onEnd()` |

All paths except `reports/atc_results.json` should be gitignored.

---

## 4. Local vs CI configuration differences

The deliberate divergences are few. **`retries` and `workers` are NOT among them** — `retries: 0` and `workers: 1` apply everywhere, local and CI.

| Setting | Local | CI | Reason |
|---------|-------|-----|--------|
| `forbidOnly` | `false` | `true` | Let devs iterate with `.only`, block it on merge. |
| `trace` | `'on-first-retry'` | `'retain-on-failure'` | Local: keep disk light. CI: always capture failures for postmortem. |
| `video` | `'off'` | `'retain-on-failure'` (when `config.reporting.videoOnFailure`) | Same rationale. |
| `headless` | `config.browser.headless` | forced `true` | CI runners have no display. |
| `github` reporter | off | opt-in (commented in shipped config) | Writes PR annotations when enabled. |

### 4.1 The `retries: 0` rule — everywhere

This is doctrine, not a local-only discipline. If a test passes on retry, it is flaky — the failure you would chase later is already in your diff. CI gets no retry allowance either: a test that needs a retry to pass in CI is a flakiness bug to fix, never something the config tolerates. Failure classification in `regression-testing` depends on this — a retry-masked pass would distort the FLAKY bucket of the GO/NO-GO analysis.

### 4.2 CI detection

`!!process.env.CI` is the single switch. GitHub Actions, GitLab CI, CircleCI, Jenkins, and Buildkite all set `CI=true`. Do not check `process.env.GITHUB_ACTIONS` or other provider-specific variables inside the Playwright config — the config must stay provider-agnostic.

---

## 5. Environment variables the config reads

The config reads through `config/variables.ts`, the single source of truth. It does not read `process.env` ad-hoc.

| Env var | Consumed by | Purpose |
|---------|-------------|---------|
| `CI` | Playwright config | Toggle local vs CI switches |
| `TEST_ENV` | `config/variables.ts` | Selects the environment entry in the internal URL map AND the credential set. `config.baseUrl` (frontend, feeds `use.baseURL`) and `config.apiUrl` (API host, feeds `ApiBase`) both come from that map — there are NO `BASE_URL` / `API_BASE_URL` env vars. |
| `LOCAL_USER_EMAIL` / `LOCAL_USER_PASSWORD` | auth setup projects | Local credentials |
| `STAGING_USER_EMAIL` / `STAGING_USER_PASSWORD` | auth setup projects | Staging credentials |
| `AUTO_SYNC` | `global.teardown.ts` | Enable TMS sync (see atc-tracing reference) |
| `TMS_PROVIDER` | `jiraSync.ts` | `xray` / `jira` / `none` |
| `STP_EXECUTION_KEY` | `jiraSync.ts` | **Xray only.** Target of the write-back: the key of the **STR** Test Execution linked to the sprint STP — never the STP itself (the sync reads the issue type and refuses a Test Plan). Unset → each run mints a new, unparented Execution. |

### 5.1 Rules

- **Never hardcode credentials** anywhere in the repo — `.env` only. Rejected at review.
- **Never read `process.env` inside an ATC** — route through `@variables`. Keeps component code portable.
- **`.env.example` is the contract** — every new variable must be added there with a placeholder; missing rows break onboarding.

---

## 6. Sharding and parallelism — while authoring

The project-level sharding used in CI pipelines is out of scope here. This section covers what you do **locally** while authoring and debugging.

### 6.1 Parallelism tuning

- **Default**: `fullyParallel: false` + `workers: 1` — serial execution is the shipped default, local and CI. Terminal output stays readable and shared-state bugs cannot hide behind interleaving.
- **Stress-testing for future parallelism**: before proposing a workers bump, prove the suite survives concurrency by overriding at the command line.
  ```bash
  bun run test -- --workers=8 --repeat-each=5
  ```
  A test that passes serially but fails here has shared state — fix it before any config-level parallelism change.

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
bun run allure:generate

# Produce kata-manifest.json (static registry of components / ATCs)
bun run kata:manifest

# Sync OpenAPI + regenerate types
bun run api:sync
```

### 7.3 Quality loop (local, before PR)

```bash
bun run test <path>         # 1. does the new test pass?
bun run types:check          # 2. no TS errors
bun run lint:check                # 3. no lint errors
bun run kata:manifest       # 4. registry updated, ATCs visible
git add kata-manifest.json  # 5. stage the manifest
bun run kata:manifest:check # 6. confirm the husky pre-commit gate would pass
```

Run in order. Do not chase lint errors before tests pass — the failing test may delete the offending code.

### 7.4 Local quality loop — kata-manifest

Two-command discipline for the test author:

| Command | When | Effect |
|---|---|---|
| `bun run kata:manifest` | After adding/renaming a Component, ATC, or Steps method | Regenerates `kata-manifest.json` in place |
| `bun run kata:manifest:check` | Before committing | Fails fast (exit 1) if the committed manifest is out of date |

`.husky/pre-commit` runs `:check` automatically when staged files touch `tests/components/`, `scripts/kata-manifest.ts`, or `kata-manifest.json` itself. Commits that don't touch those paths skip the gate (no perf penalty).

### 7.5 Manifest troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `--check` exits 1 with "stale" | Component or ATC change not regenerated | `bun run kata:manifest && git add kata-manifest.json` |
| `--check` exits 1 with "missing" | `kata-manifest.json` not committed yet | `bun run kata:manifest && git add kata-manifest.json` (first-time only) |
| ATC missing from manifest after regen | Used template literal `` @atc(`PROJ-${id}`) `` instead of string literal | Change to `@atc('PROJ-XXX')` — the scanner only matches string literals |
| Phantom ATC in manifest | `@atc(...)` example inside a JSDoc/comment was captured | Confirm the scanner is comment-aware (commit `c339533` fixed this); ensure the comment line begins with `//` or `*` |
| Component missing from manifest | File listed in `EXCLUDED_FILES` (`scripts/kata-manifest.ts`) | Rename the file, or remove it from the exclusion list |
| Class name in manifest looks wrong | First `export class PascalCase` in the file is not the intended one | Make the intended class the first export; or refactor the file |
| Husky gate fires on unrelated commit | Staged files include `tests/components/**` (e.g. README inside the dir) | Move the unrelated file out of `tests/components/`, or accept the gate run |

---

## 8. Gotchas

1. **Dependency projects do not re-run between test projects.** `ui-setup` runs once per invocation. If you change auth credentials mid-session, invalidate `.auth/` manually (`rm -rf .auth`).
2. **Serial today does not license shared state.** The shipped config runs `fullyParallel: false` + `workers: 1`, but a test that would fail under parallelism has shared state — locate it and remove it now; do not reach for `test.describe.serial`, and do not let serial execution hide the bug that blocks the future workers bump.
3. **Project `testMatch` is case-sensitive on Linux, case-insensitive on macOS.** CI is Linux. Match the pattern exactly on disk.
4. **The `global-teardown` PROJECT runs even if all tests were skipped.** It is wired via the `teardown:` property on the `global-setup` project (not a `globalTeardown` hook). Use it for artifact cleanup and for the TMS sync gate (which has its own `if (AUTO_SYNC)` guard).
5. **The `baseURL` applies to `page.goto('/path')` only.** API requests go through `ApiBase` which uses `config.apiUrl` from `config/variables.ts`. They are independent.
6. **Reporter order is preserved.** Moving `html` before `KataReporter` can cause the tree view to miss step events on fast tests. Keep `KataReporter` first.
7. **`retries: 0` applies in CI too.** There is no retry allowance anywhere in this config. A test that would only pass on retry is a bug — fix the test or the product, never the retry count.
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
