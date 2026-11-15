# CI Integration: Playwright Config, Reporters, Projects

Load when authoring or modifying `playwright.config.ts`, wiring a new reporter, tuning parallelism or sharding while authoring, or debugging why a test behaves differently locally and in CI. The scope is Playwright-level: config, reporters, projects, sharding, environment propagation.

Regression and smoke orchestration (GitHub Actions workflows, `gh run watch`, failure triage, release GO/NO-GO) belongs to the `regression-testing` skill. If you are building the pipeline that runs these suites on a schedule or on PRs, start there.

---

## 1. `playwright.config.ts`: canonical shape

The config rests on four concerns: projects, reporters, `use` (global defaults) and the CI-versus-local switches. Everything else derives from them.

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
    trace: 'retain-on-failure', // NOT `on-first-retry`: with `retries: 0` there is never a first retry, so a local failure would produce no trace at all
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

    // ONE SMOKE PROJECT PER SURFACE. A single project spanning
    // `{e2e,integration}` has to pick ONE `use` block, and picking the UI one
    // hands a browser storageState — and therefore the session COOKIE — to API
    // tests. A test that clears the Bearer token to assert 401 then gets 200,
    // because the cookie still authenticates. Measured in this boilerplate:
    // the same test passed under `--project=integration` and failed under
    // `--project=smoke`. Each half mirrors its full-suite sibling plus the grep.
    { name: 'smoke-ui',
      grep: /@critical/,
      testMatch: '**/e2e/**/*.test.ts',
      dependencies: ['ui-setup'],
      use: { ...devices['Desktop Chrome'], storageState: config.auth.storageStatePath } },

    { name: 'smoke-api',
      grep: /@critical/,
      testMatch: '**/integration/**/*.test.ts',
      dependencies: ['api-setup'],
      use: {} },

    { name: 'global-teardown',
      testMatch: /global\.teardown\.ts/,
      testDir: './tests/teardown' },

    { name: 'sandbox',                 // isolated experiments: `*.sandbox.ts`, no dependencies,
      testMatch: /.*\.sandbox\.ts/ },   // so no setup, no auth state and no teardown run with it
  ],

  outputDir: 'test-results',
});
```

Rules this template encodes:

- **URLs come from `config/variables.ts`.** The config imports `config` and `env` and reads `process.env` only for the `CI` flag. See §5.
- **`testMatch: /.*\.test\.ts/`**: only `*.test.ts` files run. A `*.spec.ts` file is silently ignored, so name test files accordingly.
- **Authentication goes through setup projects.** A project that needs a logged-in state depends on `ui-setup` or `api-setup` and consumes the generated `storageState` file. Do not log in from `beforeEach` of every test.
- **`forbidOnly: !!process.env.CI`**: `test.only` is legal locally for fast iteration and fails the build on CI, which catches accidental commits.
- **`retries: 0` everywhere**, local and CI (§4.1).
- **Serial execution is the default** (`fullyParallel` and `workers` in `playwright.config.ts`). Parallelism is a deliberate upgrade once the suite is proven stable, not a knob to flip casually (§6.1).
- **Teardown is a project.** `global-teardown` is activated by the `teardown:` property on `global-setup`, not by a `globalTeardown` hook and not by `dependencies`.
- **`--no-deps` also skips the teardown.** Playwright ignores a project's `teardown` together with its `dependencies`, so `--project=e2e --no-deps` runs no setup and no `global-teardown`, and whatever the run creates stays behind. Use it only against state you set up by hand.

---

## 2. Projects dependency graph

The setup projects gate the test projects. Visualised:

```
global-setup
 ├── ui-setup  ──► e2e, smoke-ui
 └── api-setup ──► integration, smoke-api
                                    (all → global-teardown)

sandbox          (no dependencies, no teardown)
```

`smoke-ui` / `smoke-api` are the `@critical` slice of each surface, one project per surface so
an API test never inherits the browser `storageState` (see the comment in the template). CI's
smoke suite runs both.

### 2.1 Generated auth artifacts

```
.auth/
├── user.json          storageState for E2E (cookies + localStorage)
└── api-state.json     JWT token + user metadata for integration tests
```

`.auth/` is gitignored. On a fresh checkout the setup projects must run before either test project, which the dependency chain encodes: `bun run test:e2e` without a prior login invokes `ui-setup` automatically.

### 2.2 Project-scoped `use`

Per-project `use` overrides global `use`. E2E sets `storageState`, integration does not. Device, viewport and locale overrides also belong at the project level, never in individual tests.

---

## 3. Reporter chain: order matters

Reporters run in order, and the first one can mutate timing metrics for the rest. The canonical order:

1. **`KataReporter`** (custom): colored terminal tree that prints step boundaries and reads the NDJSON written by `@atc` to show per-ATC status. It goes first so its step events are registered before Allure grabs them.
2. **`html`**: Playwright's built-in HTML report in `playwright-report/`. `open: 'never'` stops it from auto-opening locally.
3. **`json`**: machine-readable summary for tooling (`test-results/results.json`).
4. **`junit`**: XML for CI tools (`test-results/junit.xml`), always on. It is never imported into Xray, because a testcase without a `test_key` would become a new Test there. The Xray write-back sends one entry per ATC from `reports/atc_results.json` instead.
5. **`allure-playwright`**: writes to `config.reporting.allureResultsDir`. `bun run allure:generate` turns that directory into a static site.
6. **`github`** (opt-in): annotates PRs with failure locations in GitHub Actions. Not recommended with matrix strategies, where errors multiply in the UI.

### 3.1 What `KataReporter` produces

Terminal output only. It reads `step.category === 'test.step'` events from Playwright and prints a nested tree:

```
🧪 Running Test [3/6] => UPEX-100: should be able to re-authenticate
    ---- ✓ ATC [PROJ-101]: authenticateSuccessfully({ email: "user@test.com", password: "***" })
    ---- API OK: 200 - https://api.example.com/auth/login
    ✅ [PROJ-101] authenticateSuccessfully - PASS (825ms)
```

The `atc_results.json` aggregation is written in `KataReporter.onEnd()`, not during individual tests; the tracing reference has the pipeline.

### 3.2 Allure attachments

`ApiBase` attaches every request/response pair to Allure automatically. `@atc` adds `allure.label`, `allure.severity`, `allure.link` based on the decorator argument. A well-written component needs no manual `testInfo.attach()` or `allure.step()`; flag them in review.

### 3.2.1 Allure suite labels: single source of truth (Playwright tags)

Allure suite and grouping labels derive from the Playwright tag on the test, so there is no separate Allure taxonomy to maintain. The `@smoke` / `@regression` / `@e2e` / `@integration` / `@critical` tag is the single source of truth: it drives both CI scope selection (`--grep @smoke`) and Allure suite grouping. A test tagged `@integration` lands in the Allure `integration` suite automatically, so add no duplicate Allure label for the same grouping.

- **One tag, two consumers.** The tag the CI workflow greps on is the tag Allure groups by. Do not tag a test `@integration` for grep and then hand-set a different Allure suite: they agree by construction because they are the same string.
- **No parallel taxonomy.** Do not invent Allure-only suite names. A new grouping is added as a Playwright tag, so CI can select it, and Allure inherits it.
- **Downstream.** `regression-testing` reads the `suite` label off each Allure result during failure analysis (`regression-testing/SKILL.md`, Phase 2 §Parse results). Because the label is tag-derived, the suite in a regression report is exactly the scope CI ran.

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

The deliberate divergences are few. `retries` and `workers` are not among them: `retries: 0` and `workers: 1` apply everywhere.

| Setting | Local | CI | Reason |
|---------|-------|-----|--------|
| `forbidOnly` | `false` | `true` | Devs iterate with `.only`; merge blocks it. |
| `trace` | `'retain-on-failure'` | `'retain-on-failure'` | NOT a divergence. `'on-first-retry'` locally is a trap while `retries: 0`: there is no first retry, so the failure you just got produces no trace. A green run writes nothing either way. |
| `video` | `'off'` | `'retain-on-failure'` (when `config.reporting.videoOnFailure`) | Same rationale. |
| `headless` | `config.browser.headless` | forced `true` | CI runners have no display. |
| `github` reporter | off | opt-in (commented in shipped config) | Writes PR annotations when enabled. |

### 4.1 The `retries: 0` rule, everywhere

A test that passes on retry is flaky, and the failure you would chase later is already in your diff. CI gets no retry allowance either: a test that needs a retry in CI is a flakiness bug to fix, never something the config tolerates. Failure classification in `regression-testing` depends on this, since a retry-masked pass would distort the FLAKY bucket of the GO/NO-GO analysis.

### 4.2 CI detection

`!!process.env.CI` is the single switch. GitHub Actions, GitLab CI, CircleCI, Jenkins and Buildkite all set `CI=true`. Do not check `process.env.GITHUB_ACTIONS` or other provider variables inside the Playwright config, which stays provider-agnostic.

---

## 5. Environment variables the config reads

The config reads through `config/variables.ts`, the single source of truth, and not from `process.env` directly.

| Env var | Consumed by | Purpose |
|---------|-------------|---------|
| `CI` | Playwright config | Toggle local vs CI switches |
| `TEST_ENV` | `config/variables.ts` | Selects the environment entry in the internal URL map AND the credential set. `config.baseUrl` (frontend, feeds `use.baseURL`) and `config.apiUrl` (API host, feeds `ApiBase`) both come from that map. There are no `BASE_URL` or `API_BASE_URL` env vars. |
| `LOCAL_USER_EMAIL` / `LOCAL_USER_PASSWORD` | auth setup projects | Local credentials |
| `STAGING_USER_EMAIL` / `STAGING_USER_PASSWORD` | auth setup projects | Staging credentials |
| `AUTO_SYNC` | `jiraSync.ts`, the workflows' `Sync Results to TMS` step, the regression `XrayImport` job | Enable the TMS write-back. It runs as a step AFTER the test step, not inside the teardown (see atc-tracing reference) |
| `TMS_PROVIDER` | `jiraSync.ts` | `xray` / `jira` / `none` |
| `STP_EXECUTION_KEY` | `jiraSync.ts` | **Xray only.** Target of the write-back: the key of the **RTR** Test Execution (or the sprint-close **STR**) and never a Test Plan (the sync reads the issue type and refuses one). Unset, each run mints a new, unparented Execution. |

### 5.1 Rules

- Credentials never appear in the repo: `.env` only. Review rejects a hardcoded one.
- An ATC never reads `process.env`. It goes through `@variables`, which keeps component code portable.
- `.env.example` is the contract: add every new variable there with a placeholder, because a missing row breaks onboarding.

---

## 6. Sharding and parallelism while authoring

Project-level sharding in CI pipelines is out of scope here. This section covers what you do locally while authoring and debugging.

### 6.1 Parallelism tuning

- **Default**: serial execution (`fullyParallel` and `workers` in `playwright.config.ts`), local and CI. Terminal output stays readable and shared-state bugs cannot hide behind interleaving.
- **Stress-testing for future parallelism**: before proposing a workers bump, prove the suite survives concurrency by overriding on the command line.
  ```bash
  bun run test -- --workers=8 --repeat-each=5
  ```
  A test that passes serially but fails here has shared state: fix it before any config-level parallelism change.

### 6.2 Sharding while authoring

Use sharding locally only when debugging CI-style execution order. Two-shard split:

```bash
bunx --bun playwright test --pass-with-no-tests --shard=1/2
bunx --bun playwright test --pass-with-no-tests --shard=2/2
```

Each shard gets a deterministic subset of the test files (a shard that matches nothing fails with "No tests found" unless `--pass-with-no-tests` is passed), which helps reproduce a "test fails only in shard 2" issue. The global `--shard` flag is orthogonal to `--project`: you can shard a single project with `--project=integration --shard=1/2`.

### 6.3 Merging reports from local shards

```bash
bunx playwright merge-reports --reporter=html ./blob-report
```

Needed only when you set `reporter: 'blob'` per shard. The blob reporter clears its output folder when a run starts, so move or upload each shard's `blob-report/` before the next run writes there. Normal authoring loops do not need it.

### 6.4 The runner is Bun

Every Playwright run in this repo (the `test*` scripts, `allure:run`, `allure:agent`, the CI jobs) goes through `bunx --bun playwright`. Without `--bun`, `bunx playwright` starts the runner on Node. Limits Playwright documents for the Bun runner:

- No watch mode: UI mode does not re-run on a file change, and `--only-changed` does not follow imports.
- `--tsconfig` and the JSX options of `tsconfig.json` have no effect, and custom ESM loaders are unsupported.
- Stack traces lack async frames and API names lose their class (`click` instead of `locator.click`), so step titles, locations and error messages can differ from a Node run. A message regex in `playwright.config.ts` (the Allure `categories`) must be checked against a Bun-run failure.
- A test's console output does not reach the trace or UI mode.

`--ui` and `--debug` need a display and have no recorded Bun run in this repo: if one misbehaves, run that one command on Node (`bunx playwright test --ui`).

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
bunx --bun playwright show-report

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

Run in order. Do not chase lint errors before tests pass, because the failing test may delete the offending code.

### 7.4 Local quality loop: kata-manifest

Two commands for the test author:

| Command | When | Effect |
|---|---|---|
| `bun run kata:manifest` | After adding/renaming a Component, ATC, or Steps method | Regenerates `kata-manifest.json` in place |
| `bun run kata:manifest:check` | Before committing | Fails fast (exit 1) if the committed manifest is out of date |

The pre-commit hook runs `:check` automatically when staged files touch the paths `.husky/framework-gates.sh` names. Commits that touch none of them skip the gate.

### 7.5 Manifest troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `--check` exits 1 with "stale" | Component or ATC change not regenerated | `bun run kata:manifest && git add kata-manifest.json` |
| `--check` exits 1 with "missing" | `kata-manifest.json` not committed yet | `bun run kata:manifest && git add kata-manifest.json` (first-time only) |
| ATC missing from manifest after regen | Used template literal `` @atc(`PROJ-${id}`) `` instead of string literal | Change to `@atc('PROJ-XXX')`; the scanner only matches string literals |
| Phantom ATC in manifest | `@atc(...)` example inside a JSDoc/comment was captured | Confirm the scanner is comment-aware; ensure the comment line begins with `//` or `*` |
| Component missing from manifest | File listed in `EXCLUDED_FILES` (`scripts/kata-manifest.ts`) | Rename the file, or remove it from the exclusion list |
| Class name in manifest looks wrong | First `export class PascalCase` in the file is not the intended one | Make the intended class the first export; or refactor the file |
| Husky gate fires on unrelated commit | Staged files include `tests/components/**` (e.g. README inside the dir) | Move the unrelated file out of `tests/components/`, or accept the gate run |

---

## 8. Gotchas

1. **Dependency projects do not re-run between test projects.** `ui-setup` runs once per invocation. If you change auth credentials mid-session, invalidate `.auth/` manually (`rm -rf .auth`).
2. **Serial execution does not license shared state.** A test that would fail under parallelism has shared state. Find it and remove it now; do not reach for `test.describe.serial`, and do not let serial execution hide the bug that blocks the future workers bump.
3. **Project `testMatch` is case-sensitive on Linux, case-insensitive on macOS.** CI is Linux. Match the pattern exactly on disk.
4. **The `global-teardown` PROJECT runs even if all tests were skipped.** It is wired via the `teardown:` property on the `global-setup` project (not a `globalTeardown` hook). Use it for artifact cleanup and the run summary, but not for the TMS sync: it finishes before `KataReporter.onEnd()` writes `reports/atc_results.json`, so the write-back is a separate `bun run test:sync` step after the process exits.
5. **The `baseURL` applies to `page.goto('/path')` only.** API requests go through `ApiBase` which uses `config.apiUrl` from `config/variables.ts`. They are independent.
6. **Reporter order is preserved.** Moving `html` before `KataReporter` can cause the tree view to miss step events on fast tests. Keep `KataReporter` first.
7. **`retries: 0` applies in CI too** (§4.1). Fix the test or the product, never the retry count.
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
| `kata-manifest.json` missing an ATC | `@atc` uses a template literal or variable | The decorator scanner requires a string literal: `@atc('PROJ-101')` |
| Storage state rejected ("token expired") | `.auth/api-state.json` stale | Delete `.auth/`, rerun; or shorten setup token TTL handling |
| Tests that pass on retry | Hidden race condition | Fix the race (§4.1) |

---

## 10. Out of scope: handoff to `regression-testing`

These belong to the regression-testing skill:

- GitHub Actions workflow YAML (PR / main / nightly / release triggers)
- `gh run list`, `gh run watch`, `gh run view --log-failed`
- Allure report hosting / publishing pipelines
- Slack / email failure notifications
- Regression GO/NO-GO analysis
- Flakiness classification across runs
- Test sharding matrices for nightly suites
- Secret management beyond "names and purposes of variables the config reads"

"Run the regression suite in CI and analyse the result" starts at `regression-testing`. "Configure Playwright so regression can run it consistently" stays here.
