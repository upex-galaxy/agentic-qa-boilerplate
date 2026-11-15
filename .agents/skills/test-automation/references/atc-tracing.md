# ATC Tracing and TMS Sync

How KATA captures ATC execution results, persists them across worker processes, aggregates them into a final report, and syncs the outcomes back to the TMS. Load when debugging why results do not appear, extending the reporter chain, wiring TMS sync in CI, or adding a new TMS provider.

`@atc` / `@step` purpose, fixture selection and parameter masking are covered in `kata-architecture.md`. This file covers the plumbing: NDJSON schema, reporter lifecycle, manifest output and TMS sync payloads.

---

## 1. Pipeline at a glance

```
Test workers (N)                 Coordinator (1)                Teardown (1)
-----------------                ---------------                ------------
@atc/@step ──► test.step()       KataReporter.onEnd()           global.teardown
     │                               │                                │
     ├─► KataReporter (terminal)     ├─► read NDJSON lines            ├─► read .atc_partial.ndjson
     ├─► allure-playwright (auto)    ├─► aggregate by testId           └─► show ATC Coverage summary
     └─► storeResult() → NDJSON      ├─► write atc_results.json
                                     └─► delete NDJSON

                                 ── process exits ──
                                          │
                                          └─► bun run test:sync → syncResults()
```

The teardown project finishes before `onEnd()`, so it reads the NDJSON partial file, not the aggregate, and it cannot sync because the file the sync reads does not exist yet. The TMS write-back is a separate command run after the Playwright process exits.

Three facts shape the design:

- Playwright spawns each project in its own worker and in-memory state does not survive, so result capture goes to disk.
- The reporter `onEnd()` runs in the coordinator process, so the aggregate file is the single source of truth for everything downstream (TMS sync, dashboards).
- Global teardown is a separate worker process that runs before `onEnd()`, so it reads the NDJSON partial file, not the aggregate.

---

## 2. NDJSON partial file

### 2.1 Location and format

```
reports/.atc_partial.ndjson
```

Each `@atc` invocation appends exactly one line. NDJSON (newline-delimited JSON) is used for safe concurrent appends: `appendFileSync` of a single line is atomic on POSIX filesystems.

One line per ATC execution:

```json
{"testId":"PROJ-101","methodName":"authenticateSuccessfully","className":"AuthApi","status":"PASS","error":null,"executedAt":"2026-03-27T19:34:58.470Z","duration":1835,"softFail":false}
```

### 2.2 Line schema

| Field | Type | Description |
|-------|------|-------------|
| `testId` | `string` | Ticket key passed to `@atc('...')`, e.g. `PROJ-101`. Must match the TMS issue key exactly. |
| `methodName` | `string` | Decorated method name, useful when multiple ATCs share a ticket. |
| `className` | `string` | Component class where the ATC lives (e.g. `AuthApi`). Disambiguates duplicates. |
| `status` | `'PASS' \| 'FAIL' \| 'SKIP'` | Outcome of this invocation. |
| `error` | `string \| null` | Error message if the ATC threw or an assertion failed. |
| `executedAt` | `string` (ISO 8601) | UTC timestamp of the call. |
| `duration` | `number` (ms) | Wall-clock time of the decorated method. |
| `softFail` | `boolean` | Whether the `@atc({ softFail: true })` option was in effect. |

### 2.3 Lifecycle rules

| Phase | What happens | Where |
|-------|--------------|-------|
| Test run start | File does not exist | — |
| First `@atc` call | `storeResult()` creates the file and appends | any worker |
| Subsequent calls | `appendFileSync` adds one line | any worker |
| `KataReporter.onEnd()` | Reads every line, aggregates by `testId`, writes the final JSON | coordinator |
| End of `onEnd()` | File is deleted, so it does not leak between runs | coordinator |

Only the reporter reads or edits the NDJSON. Any other reader races with the cleanup and can double-count. The one exception is the teardown summary in §7, which reads it before the reporter runs and does not write.

---

## 3. Aggregated result file

### 3.1 Location

```
reports/atc_results.json
```

Written by `KataReporter.onEnd()` in the coordinator process. It persists after the run, and downstream tooling (TMS sync, dashboards) reads from here.

Beside it, `KataReporter.onEnd()` writes `reports/test-outcomes.json`: one record per Playwright test with its outcome class (`passed`, `failed`, `known-defect`, `unexpected-pass`, `skipped`) and the ATC ids it ran, which `@atc` pushes as an `atc` annotation (ADR-0020). The run headline comes from that file. The TMS write-back keeps reading `atc_results.json`.

### 3.2 Schema

```json
{
  "generatedAt": "2026-03-27T19:35:03.356Z",
  "summary": {
    "total": 2,
    "passed": 1,
    "failed": 1,
    "skipped": 0,
    "executions": 5,
    "testIds": ["PROJ-101", "PROJ-202"]
  },
  "results": {
    "PROJ-101": [
      { "testId": "PROJ-101", "methodName": "authenticateSuccessfully", "className": "AuthApi",
        "status": "PASS", "error": null, "executedAt": "2026-03-27T19:34:58.470Z",
        "duration": 1835, "softFail": false }
    ],
    "PROJ-202": [
      { "testId": "PROJ-202", "methodName": "createOrder", "className": "OrdersApi",
        "status": "FAIL", "error": "Expected 201, received 500", "executedAt": "...",
        "duration": 342, "softFail": false }
    ]
  }
}
```

### 3.3 Summary field semantics

| Field | Meaning |
|-------|---------|
| `total` | Count of **unique ATC IDs** that executed at least once, equal to `testIds.length`. |
| `passed` | Unique ATCs where **every** execution passed. |
| `failed` | Unique ATCs where **any** execution failed. Conservative rule: one bad run poisons the ATC. |
| `skipped` | Unique ATCs where **every** execution was `SKIP`. |
| `executions` | Raw count of NDJSON lines, the sum of invocations across all tests. |
| `testIds` | Sorted list of unique ATC IDs. Useful for CI diffs. |

`total` counts unique ATCs and `executions` counts raw invocations, so an ATC used as a precondition in 10 tests shows `executions: 10` and contributes `1` to `total`.

---

## 4. ATCs are reusable: final status logic

An ATC can be invoked from many places in a single run:

```
PROJ-101 authenticateSuccessfully
├── tests/setup/api-auth.setup.ts        (once during setup)
├── tests/integration/auth/login.test.ts (invoked as a precondition)
├── tests/integration/orders/create.test.ts (invoked as a precondition)
└── tests/e2e/dashboard/home.test.ts     (invoked via its LoginPage variant)
```

When computing the status to send to the TMS:

```typescript
const finalStatus = executions.every(e => e.status === 'PASS') ? 'PASSED' : 'FAILED';
```

The final status follows from the executions:

| Executions | Final status | Why |
|------------|--------------|-----|
| all PASS | `PASSED` | ATC is reliable across every context it was used in. |
| any FAIL | `FAILED` | One broken context is a real failure, and a passing majority must not hide it. |
| only FAIL | `FAILED` | Every context failed. |
| none | not synced | The ATC was not touched this run. Nothing to report. |

A parameterised ATC that varies by input is still one ATC for TMS purposes: the `testId` is the unit, not the parameter set.

---

## 5. Sensitive parameter masking

Both decorators mask argument values whose keys are in the `SENSITIVE_KEYS` set in `tests/utils/decorators.ts`. `api-patterns.md` has the canonical parameter names that make masking work by default. To mask more keys, add them to that set.

---

## 6. KataReporter output

Both decorators wrap execution in `test.step()`. KataReporter subscribes to `onStepBegin` / `onStepEnd` / `onTestEnd` and prints a tree view:

```
🧪 Running Test [3/6] => UPEX-100: should be able to re-authenticate
    ---- ✓ ATC [PROJ-101]: authenticateSuccessfully({ email: "user@test.com", password: "***" })
    ---- API OK: 200 - https://app.example.com/api/auth/login
        ---- ✓ getCurrentUser()
        ---- API OK: 200 - https://app.example.com/api/auth/me
            ---- step passed ✅ [195ms]
        ---- step passed ✅ [820ms]
    ✅ [PROJ-101] authenticateSuccessfully - PASS (825ms)
    ---- 🔎 Test Output: ✅ PASSED
```

Line sources:

| Line | Emitter |
|------|---------|
| `---- ✓ ATC [ID]: method(args)` | KataReporter `onStepBegin` |
| `---- ✓ helper()` | KataReporter `onStepBegin` (nested) |
| `---- API OK: 200 - url` | `ApiBase` HTTP log |
| `---- step passed ✅ [Nms]` | KataReporter `onStepEnd` |
| `✅ [ID] method - PASS (Nms)` | `@atc` console.log |
| `---- 🔎 Test Output: ✅ PASSED` | KataReporter `onTestEnd` |

KataReporter prints only steps where `step.category === 'test.step'`; lifecycle hooks and `expect` steps are ignored.

---

## 7. Global teardown summary

Before the reporter fires, the teardown prints a stand-alone summary from `reports/.atc_partial.ndjson`:

```
============================================================
KATA Architecture - Global Teardown
============================================================
ATC Coverage:
   1 unique ATC tracked (2 total executions)
   ✅ Passed: 1 | ❌ Failed: 0 | ⏭️ Skipped: 0
[SKIP] TMS sync is OFF — these results were NOT written back to the TMS. Set AUTO_SYNC=true to enable it, then run `bun run test:sync` after the suite.
============================================================
📊 ATC Report generated: reports/atc_results.json
```

The sync does not run here. With `AUTO_SYNC=true` the teardown only says so, and the write-back happens when `bun run test:sync` runs after the process exits.

---

## 8. TMS sync

### 8.1 Trigger

A separate command, never an in-process call. `reports/atc_results.json` is written by `KataReporter.onEnd()`, which fires after every project (the teardown included), so anything that syncs from inside the run reads the previous run's file locally or none at all in CI.

```bash
AUTO_SYNC=true bun run test   # writes reports/atc_results.json on exit
bun run test:sync             # reads it and writes the results back
```

The suite workflows under `.github/workflows/` run the second line as a `Sync Results to TMS` step gated on `AUTO_SYNC == 'true'`, right after the test step. On an Xray project, `regression.yml` skips that step and its `XrayImport` job imports the same file instead, through the same payload builder (`tests/utils/xrayResults.ts`). `syncResults()` still honours the `AUTO_SYNC` gate, and in CI it exits non-zero when the report file is missing instead of returning silently.

**When to run `bun run test:sync`.** Run it only after a run against the environment the TC's precondition names (the Test Execution's Test Environment). The write-back records `PASSED` / `FAILED`, and a case is `PASSED` or `FAILED` only when observed in that environment (`../../agentic-qa-core/references/discovery-driven-doctrine.md` §5.2). A Code-phase run, the local gate, a local stack or any other environment is evidence about the code, not a TMS result, so leave `AUTO_SYNC` off for it. The sync code does not check the environment; this rule is on whoever runs it. A routine or worker with no brief naming the Execution and its environment skips the sync and reports.

### 8.2 Provider routing

```
syncResults()
├── provider = 'xray'  → syncToXray()
│   ├── POST /authenticate  (bearer token)
│   └── POST /import/execution (batch, all ATCs in one payload:
│        one entry per ATC, testKey = the @atc id, no testInfo,
│        so the import cannot create a Test)
│
├── provider = 'jira'  → syncToJiraDirect()
│   ├── For each testId:
│   │   ├── PUT /issue/{testId}       (update Test Status custom field)
│   │   └── POST /issue/{testId}/comment (execution details)
│   └── Return { success, failed }
│
└── provider = 'none'  → skip
```

### 8.3 Environment variables

Required for either provider:

```env
AUTO_SYNC=true
TMS_PROVIDER=xray           # 'xray' | 'jira' | 'none'
```

Xray Cloud:

```env
XRAY_CLIENT_ID=...
XRAY_CLIENT_SECRET=...
XRAY_PROJECT_KEY=PROJ
STP_EXECUTION_KEY=PROJ-456   # Xray only: the RTR (or sprint-close STR) the run writes back to
```

`STP_EXECUTION_KEY` decides where results land. Despite the name it holds the key of a Test Execution, either the RTR of a regression run or the sprint-close STR, and never a Test Plan's own key: `tests/utils/jiraSync.ts` reads the target's issue type and refuses a Test Plan outright. Left unset, every run mints a new, unparented Execution.

Jira Direct:

```env
# NOTE: the Atlassian site HOST is not a .env variable. It lives in
# .agents/project.yaml -> issue_tracker.atlassian_url (`bun run agents:setup`).
ATLASSIAN_EMAIL=email@company.com
ATLASSIAN_API_TOKEN=...
JIRA_TEST_STATUS_FIELD={{jira.test_status}}   # resolved at runtime against .agents/jira-fields.json (regenerate via `bun run jira:sync-fields --force`)
```

### 8.4 Comment body sent to the TMS

For each ATC, the provider writes a comment shaped like:

```
KATA ATC: authenticateSuccessfully
Executions: 5
Duration: 577ms
Last run: 2026-03-27T19:35:01.866Z

Error:
Expected 200, received 401
```

The `Executions` count is the total invocations; the other fields come from the **last execution**. `Error` is omitted when the final status is `PASSED`.

### 8.5 Provider comparison

| Aspect | Xray Cloud | Jira Direct |
|--------|-----------|-------------|
| Issue type used | `Test` (Xray) | any (`Task`, `Story`, ...); custom field `Test Status` drives state |
| API surface | Xray REST | Generic Jira REST v3 |
| Batch upload | Yes, single `/import/execution` | No, one `PUT` + one `POST` per ATC |
| Test plans / executions | Native | Not supported |
| Cost | Paid Marketplace app | Free |

Jira Direct suits small teams and MVPs; move to Xray when reporting needs grow.

### 8.6 Test ID format

```
UPEX-123      e.g. DEMO-456
```

Rules:

- It matches the TMS issue key exactly (case-sensitive).
- The issue exists before sync, because sync does not create tickets.
- Jira Direct accepts any Jira issue type; Xray expects the `Test` type.

---

## 9. kata:manifest: static registry of what exists

`bun run kata:manifest` is independent of test execution. It scans `tests/components/**` and emits `kata-manifest.json` describing every component and every `@atc(...)` call it finds, which answers "what ATCs exist?" without running the suite or reading source.

### 9.1 Commands

```bash
bun run kata:manifest              # write kata-manifest.json at project root
bun run kata:manifest:watch        # regenerate on file change
bun run kata:manifest --stdout     # write to stdout instead of a file
bun run kata:manifest:check        # CI-grade freshness check; exits 1 if kata-manifest.json is stale.
                                   # Used by .husky/pre-commit when staged files touch
                                   # tests/components/, scripts/kata-manifest.ts, or kata-manifest.json.
```

Scan roots and excluded files: the `COMPONENT_PATHS` and `EXCLUDED_FILES` constants in `scripts/kata-manifest.ts`.

Extraction pattern: `@atc\s*\(\s*['"]([^'"]+)['"]`. A literal string key is required; template literals and computed IDs are not picked up.

### 9.2 Output schema

```json
{
  "version": "1.0",
  "generatedAt": "2026-04-14T09:12:00.000Z",
  "components": {
    "api": [
      {
        "name": "AuthApi",
        "file": "AuthApi.ts",
        "relativePath": "tests/components/api/AuthApi.ts",
        "atcs": [
          { "id": "PROJ-101", "method": "authenticateSuccessfully", "line": 42 },
          { "id": "PROJ-102", "method": "authenticateWithInvalidCredentials", "line": 67 }
        ]
      }
    ],
    "ui": [ /* same shape */ ]
  },
  "steps": [
    {
      "name": "ExampleSteps",
      "file": "ExampleSteps.ts",
      "relativePath": "tests/components/steps/ExampleSteps.ts",
      "methods": ["authenticateUser", "createTestResource", "navigateAsAuthenticatedUser"]
    }
  ],
  "summary": {
    "totalComponents": 12,
    "totalATCs": 57,
    "apiComponents": 7,
    "uiComponents": 5,
    "stepsModules": 1
  }
}
```

Steps entries list method names only: Steps are not `@atc`-decorated and carry no TMS IDs.

### 9.3 When to run it

| Situation | Why |
|-----------|-----|
| New AI session | Feed the manifest as context instead of scanning the tree |
| CI precondition | Assert `totalATCs` did not drop unexpectedly (guard against accidental deletion) |
| Coverage comparison | Diff manifest vs TMS ticket list to find ATCs not yet linked |
| Planning phase | Check which components already exist before proposing new ones |

The manifest says what exists in code; `atc_results.json` says what ran in the last test run. They complement each other and cannot stand in for one another.

---

## 10. Debugging guide

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `Total: 0` in teardown summary | NDJSON never written: no `@atc` decorators applied, or only `@step` | Check decorators are present on state-changing methods |
| ATC runs but nothing in terminal | Method not wrapped in `test.step()`, or reporter not in the chain | Verify `KataReporter` is listed in `playwright.config.ts` reporters; confirm `decorators.ts` imports `test` from `@playwright/test` |
| Sensitive value visible in step title | Key not in `SENSITIVE_KEYS` | Add the key to `SENSITIVE_KEYS` in `tests/utils/decorators.ts` |
| Sync reports "No ATC results to sync" | `atc_results.json` empty | Run tests first; check KataReporter ran `generateAtcReport()`; confirm reporter config |
| Sync fails with 401 | Bad TMS credentials | Verify `XRAY_CLIENT_*` or `ATLASSIAN_API_TOKEN`; check expiry and permissions |
| Sync fails with "Test key not found" | TMS issue missing or mistyped | Check case-sensitive exact match; a missing Test goes to `/test-documentation` (signed ROI first, `../SKILL.md` §"TC source gate") and is not created here |
| Custom-field error (Jira Direct) | Wrong `JIRA_TEST_STATUS_FIELD` ID | `[ISSUE_TRACKER_TOOL] list_fields()` (load `/acli`) and grep for the field; or re-run `bun run jira:sync-fields --force` |
| Sync is slow | Jira Direct = one request per ATC | Batch via Xray if budget allows; move sync off the local loop and run it only in CI on `main` |

---

## 11. Files that own this pipeline

| File | Responsibility |
|------|----------------|
| `tests/utils/decorators.ts` | `@atc`, `@step`, `formatArgs`, `storeResult` (NDJSON writer), `SENSITIVE_KEYS` |
| `tests/KataReporter.ts` | Terminal tree output; `generateAtcReport()` in `onEnd()` (NDJSON → JSON); NDJSON cleanup |
| `tests/teardown/global.teardown.ts` | Reads `.atc_partial.ndjson`, prints the ATC Coverage summary, states whether the write-back is on. Does not sync |
| `tests/utils/jiraSync.ts` | `syncToXray()`, `syncToJiraDirect()`, provider router |
| `playwright.config.ts` | Reporter chain (KataReporter must be registered), `global-teardown` PROJECT (wired via `teardown:` on the `global-setup` project, not a `globalTeardown` hook) |
| `config/variables.ts` | `config.tms.*`, reads the env vars listed in §8.3 |
| `scripts/kata-manifest.ts` | Static scanner, produces `kata-manifest.json` |
| `reports/.atc_partial.ndjson` | Ephemeral per-run capture (deleted in `onEnd()`) |
| `reports/atc_results.json` | Persistent aggregated result, input to `bun run test:sync` (written too late for the teardown) |
| `kata-manifest.json` | Static registry of components and ATCs in source |
