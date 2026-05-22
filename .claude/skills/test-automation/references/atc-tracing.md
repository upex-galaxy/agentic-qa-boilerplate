# ATC Tracing and TMS Sync

How KATA captures ATC execution results, persists them across worker processes, aggregates them into a final report, and syncs the outcomes back to the TMS. Load when debugging why results do not appear, extending the reporter chain, wiring TMS sync in CI, or adding a new TMS provider.

Assumed knowledge: `@atc` / `@step` purpose, fixture selection, and parameter masking are covered in `kata-architecture.md`. This file focuses on the plumbing — NDJSON schema, reporter lifecycle, manifest output, TMS sync payloads.

---

## 1. Pipeline at a glance

```
Test workers (N)                 Coordinator (1)                Teardown (1)
-----------------                ---------------                ------------
@atc/@step ──► test.step()       KataReporter.onEnd()           global.teardown
     │                               │                                │
     ├─► KataReporter (terminal)     ├─► read NDJSON lines            ├─► read atc_results.json
     ├─► allure-playwright (auto)    ├─► aggregate by testId           ├─► show ATC Coverage summary
     └─► storeResult() → NDJSON      ├─► write atc_results.json        └─► if AUTO_SYNC=true
                                     └─► delete NDJSON                      call syncResults()
```

Key invariants:

- Playwright spawns each project in its own worker; in-memory state does not survive. Durable result capture must go to disk.
- The reporter `onEnd()` runs in the coordinator process, so the aggregate file is the single source of truth for everything downstream (teardown summary, TMS sync, dashboards).
- Global teardown is a separate worker process. It reads the aggregated JSON — not the NDJSON — because `onEnd()` has already converted it.

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
| `testId` | `string` | Ticket key passed to `@atc('...')` — e.g. `PROJ-101`. Must match the TMS issue key exactly. |
| `methodName` | `string` | Decorated method name — useful when multiple ATCs share a ticket. |
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
| End of `onEnd()` | File is deleted — must not leak between runs | coordinator |

Never read or edit the NDJSON outside the reporter. A teardown that reads it directly will double-count or race with the cleanup.

---

## 3. Aggregated result file

### 3.1 Location

```
reports/atc_results.json
```

Written by `KataReporter.onEnd()` in the coordinator process. Persists after the run — downstream tooling (teardown, TMS sync, dashboards) reads from here.

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
| `total` | Count of **unique ATC IDs** that executed at least once — equal to `testIds.length`. |
| `passed` | Unique ATCs where **every** execution passed. |
| `failed` | Unique ATCs where **any** execution failed. Conservative rule — one bad run poisons the ATC. |
| `skipped` | Unique ATCs where **every** execution was `SKIP`. |
| `executions` | Raw count of NDJSON lines — sum of invocations across all tests. |
| `testIds` | Sorted list of unique ATC IDs. Useful for CI diffs. |

The split between `total` (unique ATCs) and `executions` (raw invocations) matters: an ATC used as a precondition in 10 tests will show `executions: 10` but contributes `1` to `total`.

---

## 4. ATCs are reusable — final status logic

An ATC can be invoked from many places in a single run:

```
PROJ-101 authenticateSuccessfully
├── tests/setup/api-auth.setup.ts      — once during setup
├── tests/integration/auth/login.test.ts — invoked as a precondition
├── tests/integration/orders/create.test.ts — invoked as a precondition
└── tests/e2e/dashboard/home.test.ts     — invoked via its LoginPage variant
```

When computing the status to send to the TMS:

```typescript
const finalStatus = executions.every(e => e.status === 'PASS') ? 'PASSED' : 'FAILED';
```

Rules and rationale:

| Executions | Final status | Why |
|------------|--------------|-----|
| all PASS | `PASSED` | ATC is reliable across every context it was used in. |
| any FAIL | `FAILED` | One broken context is a real failure — do not hide it behind a passing majority. |
| only FAIL | `FAILED` | Straightforward. |
| none | not synced | The ATC was not touched this run. Nothing to report. |

A parameterised ATC that varies by input is still one ATC for TMS purposes — the `testId` is the unit, not the parameter set.

---

## 5. Sensitive parameter masking

Both decorators mask argument values whose keys are in the `SENSITIVE_KEYS` set in `tests/utils/decorators.ts` (canonical keys: `password`, `token`, `secret`, `authorization`, `access_token`). See `api-patterns.md` for the canonical parameter-name rules that make masking work by default. To mask additional keys, add them to that set.

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
| `---- API OK: 200 - url` | `ApiBase` — HTTP log |
| `---- step passed ✅ [Nms]` | KataReporter `onStepEnd` |
| `✅ [ID] method - PASS (Nms)` | `@atc` console.log |
| `---- 🔎 Test Output: ✅ PASSED` | KataReporter `onTestEnd` |

Filter criterion: KataReporter only prints steps where `step.category === 'test.step'`. Lifecycle hooks and `expect` steps are ignored.

---

## 7. Global teardown summary

After the reporter fires, the teardown prints a stand-alone summary from `reports/atc_results.json`:

```
============================================================
KATA Architecture - Global Teardown
============================================================
ATC Coverage:
   1 unique ATC tracked (2 total executions)
   ✅ Passed: 1 | ❌ Failed: 0 | ⏭️ Skipped: 0
[SKIP] TMS sync disabled (set AUTO_SYNC=true to enable)
============================================================
📊 ATC Report generated: reports/atc_results.json
```

If `AUTO_SYNC=true`, `syncResults()` runs next and routes to the configured provider.

---

## 8. TMS sync

### 8.1 Trigger

```typescript
// tests/teardown/global.teardown.ts
if (process.env.AUTO_SYNC === 'true') {
  await syncResults();
}
```

### 8.2 Provider routing

```
syncResults()
├── provider = 'xray'  → syncToXray()
│   ├── POST /authenticate  (bearer token)
│   └── POST /import/execution (batch, all ATCs in one payload)
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
```

Jira Direct:

```env
ATLASSIAN_URL=https://company.atlassian.net
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
| Issue type used | `Test` (Xray) | any (`Task`, `Story`, ...) — custom field `Test Status` drives state |
| API surface | Xray REST | Generic Jira REST v3 |
| Batch upload | Yes — single `/import/execution` | No — one `PUT` + one `POST` per ATC |
| Test plans / executions | Native | Not supported |
| Cost | Paid Marketplace app | Free |

Pick Jira Direct for small teams or MVPs; upgrade to Xray when reporting needs grow.

### 8.6 Test ID format

```
UPEX-123      e.g. DEMO-456
```

Rules:

- Must match the TMS issue key exactly (case-sensitive).
- Issue must exist before sync — sync does not create tickets.
- Any Jira issue type is acceptable for Jira Direct; Xray expects `Test` type specifically.

---

## 9. kata:manifest — static registry of what exists

`bun run kata:manifest` is independent of test execution. It scans `tests/components/**` and emits `kata-manifest.json` describing every component and every `@atc(...)` call it finds. Use it to answer "what ATCs exist?" without running the suite or scanning source files manually.

### 9.1 Commands

```bash
bun run kata:manifest              # write kata-manifest.json at project root
bun run kata:manifest:watch        # regenerate on file change
bun run kata:manifest --stdout     # write to stdout instead of a file
bun run kata:manifest:check        # CI-grade freshness check; exits 1 if kata-manifest.json is stale.
                                   # Used by .husky/pre-commit when staged files touch
                                   # tests/components/, scripts/kata-manifest.ts, or kata-manifest.json.
```

Scan roots (hard-coded):

```
tests/components/api/**/*.ts
tests/components/ui/**/*.ts
tests/components/preconditions/**/*.ts
```

Excluded files: `ApiBase.ts`, `UiBase.ts`, `TestContext.ts`, `TestFixture.ts`, `ApiFixture.ts`, `UiFixture.ts`, `index.ts`.

Extraction pattern: `@atc\s*\(\s*['"]([^'"]+)['"]` — a literal string key is required. Template literals and computed IDs are not picked up.

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
  "preconditions": [
    {
      "name": "AuthSteps",
      "file": "AuthSteps.ts",
      "relativePath": "tests/components/preconditions/AuthSteps.ts",
      "methods": ["loginAsAdmin", "loginAsStandardUser"]
    }
  ],
  "summary": {
    "totalComponents": 12,
    "totalATCs": 57,
    "apiComponents": 7,
    "uiComponents": 5,
    "preconditionModules": 3
  }
}
```

Preconditions list method names only — Steps are not `@atc`-decorated and carry no TMS IDs.

### 9.3 When to run it

| Situation | Why |
|-----------|-----|
| New AI session | Feed the manifest as context instead of scanning the tree |
| CI precondition | Assert `totalATCs` did not drop unexpectedly (guard against accidental deletion) |
| Coverage comparison | Diff manifest vs TMS ticket list to find ATCs not yet linked |
| Planning phase | Check which components already exist before proposing new ones |

The manifest is a static registry — it says what **exists in code**. `atc_results.json` says what **ran in the last test run**. They complement each other but are not interchangeable.

---

## 10. Debugging guide

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `Total: 0` in teardown summary | NDJSON never written — no `@atc` decorators applied, or only `@step` | Check decorators are present on state-changing methods |
| ATC runs but nothing in terminal | Method not wrapped in `test.step()`, or reporter not in the chain | Verify `KataReporter` is listed in `playwright.config.ts` reporters; confirm `decorators.ts` imports `test` from `@playwright/test` |
| Sensitive value visible in step title | Key not in `SENSITIVE_KEYS` | Add the key to `SENSITIVE_KEYS` in `tests/utils/decorators.ts` |
| Sync reports "No ATC results to sync" | `atc_results.json` empty | Run tests first; check KataReporter ran `generateAtcReport()`; confirm reporter config |
| Sync fails with 401 | Bad TMS credentials | Verify `XRAY_CLIENT_*` or `ATLASSIAN_API_TOKEN`; check expiry and permissions |
| Sync fails with "Test key not found" | TMS issue missing or mistyped | Create the issue in the TMS first; check case-sensitive exact match |
| Custom-field error (Jira Direct) | Wrong `JIRA_TEST_STATUS_FIELD` ID | `[ISSUE_TRACKER_TOOL] list_fields()` (load `/acli`) and grep for the field; or re-run `bun run jira:sync-fields --force` |
| Sync is slow | Jira Direct = one request per ATC | Batch via Xray if budget allows; move sync off the local loop — run only in CI on `main` |

---

## 11. Files that own this pipeline

| File | Responsibility |
|------|----------------|
| `tests/utils/decorators.ts` | `@atc`, `@step`, `formatArgs`, `storeResult` (NDJSON writer), `SENSITIVE_KEYS` |
| `tests/KataReporter.ts` | Terminal tree output; `generateAtcReport()` in `onEnd()` (NDJSON → JSON); NDJSON cleanup |
| `tests/teardown/global.teardown.ts` | Reads `atc_results.json`, prints summary, calls `syncResults()` if `AUTO_SYNC=true` |
| `tests/utils/jiraSync.ts` | `syncToXray()`, `syncToJiraDirect()`, provider router |
| `playwright.config.ts` | Reporter chain (KataReporter must be registered), `globalTeardown` hook |
| `config/variables.ts` | `config.tms.*` — reads the env vars listed in §8.3 |
| `scripts/kata-manifest.ts` | Static scanner — produces `kata-manifest.json` |
| `reports/.atc_partial.ndjson` | Ephemeral per-run capture (deleted in `onEnd()`) |
| `reports/atc_results.json` | Persistent aggregated result — input to teardown and sync |
| `kata-manifest.json` | Static registry of components and ATCs in source |
