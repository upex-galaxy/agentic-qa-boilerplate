# ATC Tracing & Result System

Technical reference for the complete ATC lifecycle: from decorator execution through cross-process persistence, report generation, terminal visibility, and TMS synchronization.

**Audience**: Anyone extending, debugging, or maintaining the ATC tracking pipeline.

**Related docs**:
- `tms-integration.md` — TMS provider setup (Xray/Jira credentials, CI config)
- `kata-architecture.md` — Layer architecture, where decorators fit
- `automation-standards.md` — ATC design rules, component templates

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  TEST EXECUTION (multiple Playwright worker processes)              │
│                                                                     │
│  @step decorator              @atc decorator                       │
│  (helper tracing)             (ATC tracing + TMS)                  │
│       │                             │                               │
│       ▼                             ▼                               │
│  test.step(title)             test.step(title)                     │
│       │                             │                               │
│       ├─► KataReporter         ├─► KataReporter                   │
│       │   (terminal output)    │   (terminal output)               │
│       │                        │                                    │
│       ├─► allure-playwright    ├─► allure-playwright               │
│       │   (auto-captured)      │   (auto-captured)                 │
│       │                        │                                    │
│       └─► (no persistence)     ├─► allure.label/severity/link     │
│                                │   (Allure metadata)               │
│                                │                                    │
│                                ├─► storeResult() → NDJSON file    │
│                                │   (cross-process persistence)     │
│                                │                                    │
│                                └─► console.log()                   │
│                                    (✅/❌ status line)              │
├─────────────────────────────────────────────────────────────────────┤
│  KATAREPORTER onEnd() (coordinator process — NOT a worker)         │
│                                                                     │
│  generateAtcReport()                                                │
│       │                                                             │
│       ├─► Read NDJSON (all worker results)                         │
│       ├─► Aggregate by testId                                      │
│       ├─► Write reports/atc_results.json                           │
│       └─► Delete NDJSON                                            │
├─────────────────────────────────────────────────────────────────────┤
│  GLOBAL TEARDOWN (separate worker process)                         │
│                                                                     │
│  Read reports/atc_results.json (already generated)                  │
│       └─► Display summary in terminal                              │
│                                                                     │
│  syncResults() (if AUTO_SYNC=true)                                 │
│       │                                                             │
│       ├─► Read atc_results.json                                    │
│       ├─► Compute finalStatus per testId                           │
│       └─► POST to Xray Cloud or Jira Direct                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Decorators

### 2.1 `@atc` — ATC Tracing + TMS Integration

Marks a method as an Acceptance Test Case linked to a Jira/Xray ticket.

**What it does on each call:**

1. Sets Allure metadata (`allure.label`, `allure.severity`, `allure.link`) — outside the step
2. Wraps execution in `test.step()` — visible in KataReporter terminal AND Allure report
3. Records the result (PASS/FAIL, duration, error) to NDJSON file
4. Logs status line to console (`✅ [PROJ-101] methodName - PASS (234ms)`)

**Signature:**

```typescript
@atc(testId: string, options?: AtcOptions)
```

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `softFail` | `boolean` | `false` | Continue execution on failure (logs warning, returns `undefined`) |
| `severity` | `string` | — | Allure severity: `blocker`, `critical`, `normal`, `minor`, `trivial` |
| `description` | `string` | — | Allure report description |

**Apply to**: Layer 3 public methods that change state (create, update, delete, authenticate).

**Example:**

```typescript
@atc('UPEX-101', { severity: 'critical' })
async authenticateSuccessfully(credentials: LoginPayload) {
  const [response, body, payload] = await this.apiPOST<TokenResponse, LoginPayload>(
    '/auth/login', credentials,
  );
  expect(response.status()).toBe(200);
  expect(body.access_token).toBeDefined();
  this.setAuthToken(body.access_token);
  return [response, body, payload];
}
```

### 2.2 `@step` — Helper Tracing

Traces read-only helper methods in the terminal and Allure report.

**What it does on each call:**

1. Wraps execution in `test.step()` — visible in KataReporter and Allure
2. That's it — no result tracking, no NDJSON, no TMS

**Signature:**

```typescript
@step  // No arguments — applied directly
```

**Apply to**: Layer 3 public helpers (read-only queries, navigation).

**Do NOT apply to**: `@atc` methods, Layer 2 base methods (`apiGET`, `apiPOST`), private methods.

**Example:**

```typescript
@step
async getCurrentUser(): Promise<[APIResponse, UserInfoResponse]> {
  return this.apiGET<UserInfoResponse>('/auth/me');
}

@step
async goto(): Promise<void> {
  await this.page.goto(this.buildUrl('/login'));
}
```

### 2.3 Comparison

| Aspect | `@atc` | `@step` |
|--------|--------|---------|
| **Purpose** | TMS traceability + tracing | Terminal tracing only |
| **Terminal** | `ATC [PROJ-101]: methodName(args)` | `methodName(args)` |
| **Allure** | Metadata + step (automatic) | Step only (automatic) |
| **NDJSON** | Yes (persisted to disk) | No |
| **TMS sync** | Yes (drives Xray/Jira updates) | No |
| **Apply to** | State-changing actions | Read-only helpers |

### 2.4 Parameter Formatting

Both decorators format method arguments for display in step titles.

**Rules:**

| Input | Output |
|-------|--------|
| `"hello"` | `"hello"` |
| `123`, `true`, `null` | `123`, `true`, `null` |
| `{ start: "2024-01-01", end: "2024-12-31" }` | `{ start: "2024-01-01", end: "2024-12-31" }` |
| `{ password: "secret123" }` | `{ password: "***" }` |
| String > 80 chars | Truncated with `"..."` |
| Object > 5 keys | First 5 keys + `, ...` |
| Object serialization > 120 chars | Truncated with `...}` |
| `[1, 2, 3]` | `[Array(3)]` |

**Sensitive keys masked**: `password`, `token`, `secret`, `authorization`, `access_token`.

---

## 3. Cross-Process Persistence (NDJSON)

### 3.1 The Problem

Playwright runs each project in a **separate worker process**:

```
Worker 1: global-setup   → own memory space
Worker 2: api-setup      → own memory space (ATCs execute here)
Worker 3: integration    → own memory space (ATCs execute here)
Worker 4: global-teardown → own memory space (needs ALL results)
```

An in-memory Map in `decorators.ts` dies with each worker. The teardown would always see zero results.

### 3.2 The Solution

Each `@atc` execution appends one JSON line to an NDJSON file on disk:

```
File: reports/.atc_partial.ndjson

{"testId":"PROJ-101","methodName":"authenticateSuccessfully","status":"PASS","duration":1835,...}
{"testId":"PROJ-101","methodName":"authenticateSuccessfully","status":"PASS","duration":577,...}
{"testId":"PROJ-202","methodName":"createOrder","status":"FAIL","error":"Expected 201...","duration":342,...}
```

**NDJSON** = Newline-Delimited JSON. One valid JSON object per line. Safe for concurrent appends from multiple workers (atomic `appendFileSync` per line).

### 3.3 Lifecycle

| Phase | What happens | File |
|-------|-------------|------|
| Test execution | `storeResult()` appends one line per ATC call | `reports/.atc_partial.ndjson` (created/appended) |
| KataReporter `onEnd()` | `generateAtcReport()` reads all lines, aggregates by testId | `reports/atc_results.json` (created) |
| After report | NDJSON file is deleted (cleanup) | `reports/.atc_partial.ndjson` (deleted) |

---

## 4. Report Structure

### 4.1 `reports/atc_results.json`

Generated by `KataReporter.onEnd()` in the coordinator process.

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
      {
        "testId": "PROJ-101",
        "methodName": "authenticateSuccessfully",
        "className": "AuthApi",
        "status": "PASS",
        "error": null,
        "executedAt": "2026-03-27T19:34:58.470Z",
        "duration": 1835,
        "softFail": false
      },
      {
        "testId": "PROJ-101",
        "methodName": "authenticateSuccessfully",
        "className": "AuthApi",
        "status": "PASS",
        "error": null,
        "executedAt": "2026-03-27T19:35:01.866Z",
        "duration": 577,
        "softFail": false
      }
    ],
    "PROJ-202": [
      {
        "testId": "PROJ-202",
        "methodName": "createOrder",
        "className": "OrdersApi",
        "status": "FAIL",
        "error": "Expected 201, received 500",
        "executedAt": "2026-03-27T19:35:02.100Z",
        "duration": 342,
        "softFail": false
      }
    ]
  }
}
```

### 4.2 Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `testId` | `string` | Jira/Xray ticket key (from `@atc('PROJ-101')`) |
| `methodName` | `string` | Decorated method name |
| `className` | `string` | Component class name (useful when same testId is in multiple components) |
| `status` | `'PASS' \| 'FAIL' \| 'SKIP'` | Outcome of this specific execution |
| `error` | `string \| null` | Error message if failed |
| `executedAt` | `string` | ISO timestamp |
| `duration` | `number` | Execution time in milliseconds |
| `softFail` | `boolean` | Whether `softFail` option was enabled |

### 4.3 Summary Fields

| Field | Description |
|-------|-------------|
| `total` | Number of **unique ATCs** that executed (= `testIds.length`) |
| `passed` | Unique ATCs where ALL executions passed |
| `failed` | Unique ATCs where ANY execution failed (conservative rule) |
| `skipped` | Unique ATCs where ALL executions were SKIP |
| `executions` | Total number of individual ATC invocations across all tests |
| `testIds` | List of unique ATC IDs that executed |

---

## 5. ATC Reuse and Status Determination

### 5.1 ATCs Are Reusable

A single ATC can be invoked from multiple test files and multiple times within a test run:

```
PROJ-101 (authenticateSuccessfully)
├── tests/setup/api-auth.setup.ts      → called once during setup
├── tests/integration/auth/test1.ts    → called as precondition
├── tests/integration/auth/test2.ts    → called as precondition
├── tests/integration/orders/test1.ts  → called as precondition
└── tests/e2e/dashboard/test1.ts       → called via LoginPage variant
```

Each invocation generates its own NDJSON line with independent status, duration, and error.

### 5.2 Final Status Logic

When syncing to TMS, the status per ATC is computed with the **conservative rule**:

```typescript
const finalStatus = executions.every(e => e.status === 'PASS') ? 'PASSED' : 'FAILED';
```

**If ALL executions passed → PASSED. If ANY execution failed → FAILED.**

This is intentional:

| Scenario | Executions | Final Status | Why |
|----------|-----------|--------------|-----|
| 5/5 pass | `[PASS, PASS, PASS, PASS, PASS]` | **PASSED** | ATC is reliable |
| 4/5 pass, 1 fail | `[PASS, PASS, PASS, PASS, FAIL]` | **FAILED** | ATC broke in one context — needs investigation |
| 1/1 fail | `[FAIL]` | **FAILED** | ATC is broken |
| 0 executions | `[]` | Not synced | ATC wasn't called this run |

### 5.3 What the TMS Comment Contains

For each ATC, the sync sends:

```
KATA ATC: authenticateSuccessfully
Executions: 5
Duration: 577ms
Last run: 2026-03-27T19:35:01.866Z

Error:
Expected 200, received 401
```

The comment shows the **last execution's** data (duration, timestamp, error). The `Executions: N` count tells you how many times it ran total.

---

## 6. Terminal Output (KataReporter)

Both `@atc` and `@step` wrap methods in `test.step()`, which KataReporter captures:

### 6.1 Output Format

```
🧪 Running Test [3/6] => UPEX-100: should be able to re-authenticate
    ---- ✓ ATC [PROJ-101]: authenticateSuccessfully({ email: "user@test.com", password: "***" })
    ---- API OK: 200 - https://dojo.upexgalaxy.com/api/auth/login
        ---- ✓ getCurrentUser()
        ---- API OK: 200 - https://dojo.upexgalaxy.com/api/auth/me
            ---- step passed ✅ [195ms]
        ---- step passed ✅ [820ms]
    ✅ [PROJ-101] authenticateSuccessfully - PASS (825ms)
    ---- 🔎 Test Output: ✅ PASSED
```

### 6.2 What Each Line Means

| Line | Source | Meaning |
|------|--------|---------|
| `---- ✓ ATC [PROJ-101]: method(args)` | KataReporter `onStepBegin` | ATC step started |
| `---- ✓ getCurrentUser()` | KataReporter `onStepBegin` | Helper step started (nested inside ATC) |
| `---- API OK: 200 - url` | ApiBase console.log | HTTP response logged by base class |
| `---- step passed ✅ [195ms]` | KataReporter `onStepEnd` | Step completed successfully |
| `✅ [PROJ-101] method - PASS (825ms)` | `@atc` console.log | ATC result summary |
| `---- 🔎 Test Output: ✅ PASSED` | KataReporter `onTestEnd` | Test-level result |

### 6.3 Teardown Output

The teardown reads the NDJSON directly (KataReporter's `onEnd()` hasn't fired yet at this point). The `📊 ATC Report generated` line appears later, after all projects complete.

```
============================================================
KATA Architecture - Global Teardown
============================================================
ATC Coverage:
   1 unique ATC tracked (2 total executions)
   ✅ Passed: 1 | ❌ Failed: 0 | ⏭️ Skipped: 0
[SKIP] TMS sync disabled (set AUTO_SYNC=true to enable)
============================================================
...
📊 ATC Report generated: reports/atc_results.json
```

---

## 7. TMS Synchronization

### 7.1 Trigger

Sync runs in the global teardown when `AUTO_SYNC=true`:

```typescript
// tests/teardown/global.teardown.ts
if (AUTO_SYNC === 'true') {
  await syncResults();
}
```

### 7.2 Provider Flow

**`syncResults()`** reads `atc_results.json` and routes to the configured provider:

```
syncResults()
├── provider = 'xray'  → syncToXray()
│   ├── POST /authenticate (get bearer token)
│   └── POST /import/execution (batch upload all ATCs)
│
├── provider = 'jira'  → syncToJiraDirect()
│   ├── For each testId:
│   │   ├── PUT /issue/{testId} (update custom field: PASS/FAIL)
│   │   └── POST /issue/{testId}/comment (execution details)
│   └── Return summary (N success, N failed)
│
└── provider = 'none'  → skip
```

### 7.3 Configuration

Set in `.env` (see `tms-integration.md` for full setup):

```env
AUTO_SYNC=true
TMS_PROVIDER=xray          # or 'jira' or 'none'
XRAY_CLIENT_ID=xxx         # Xray Cloud only
XRAY_CLIENT_SECRET=xxx     # Xray Cloud only
JIRA_URL=https://...       # Jira Direct only
JIRA_USER=email            # Jira Direct only
JIRA_API_TOKEN=xxx         # Jira Direct only
```

---

## 8. File Reference

| File | Responsibility |
|------|---------------|
| `tests/utils/decorators.ts` | `@atc`, `@step`, `formatArgs`, NDJSON write (`storeResult`) |
| `tests/KataReporter.ts` | Terminal output, `generateAtcReport()` (NDJSON → JSON aggregation in `onEnd()`) |
| `tests/teardown/global.teardown.ts` | Reads NDJSON directly, displays ATC Coverage summary, calls `syncResults()` |
| `tests/utils/jiraSync.ts` | TMS API integration (Xray Cloud, Jira Direct) |
| `playwright.config.ts` | Reporter chain, project/teardown configuration |
| `config/variables.ts` | TMS config values (`config.tms.*`) |
| `reports/.atc_partial.ndjson` | Ephemeral — exists only during test run |
| `reports/atc_results.json` | Final aggregated report (persists after run) |

---

## 9. Debugging Guide

### ATC results show Total: 0

**Cause**: NDJSON file doesn't exist or is empty when KataReporter's `onEnd()` runs.

**Check**:
1. Verify `@atc` decorators are applied (not just `@step`)
2. Check that `reports/.atc_partial.ndjson` is created during test execution
3. Verify KataReporter is in the reporter chain in `playwright.config.ts`

### ATC executes but doesn't appear in terminal

**Cause**: Method is not wrapped in `test.step()`.

**Check**:
1. Verify `import { test } from '@playwright/test'` is in `decorators.ts`
2. Confirm KataReporter filters by `step.category === 'test.step'` (not `hook`)

### Passwords visible in terminal output

**Cause**: Key name not in the `SENSITIVE_KEYS` set.

**Fix**: Add the key to `SENSITIVE_KEYS` in `decorators.ts`:

```typescript
const SENSITIVE_KEYS = new Set([
  'password', 'token', 'secret', 'authorization', 'access_token',
  'your_new_key',  // ← add here
]);
```

### TMS sync shows "No ATC results to sync"

**Cause**: `atc_results.json` is empty or has no results.

**Check**:
1. Run tests first (`bun run test`)
2. Verify `reports/atc_results.json` exists and has results
3. Check that KataReporter ran `generateAtcReport()` before teardown (verify reporter is configured)

---

**Source files**: `tests/utils/decorators.ts`, `tests/KataReporter.ts`, `tests/utils/jiraSync.ts`, `tests/teardown/global.teardown.ts`

**Last Updated**: 2026-03-28
