# Review Checklists — E2E and API Deltas

Load during Phase 3 (Review) of the Plan → Code → Review pipeline. This file is a **delta**: it assumes the shared KATA review checklists from `automation-standards.md` §10 (Component review, ATC review, Test file review) have already been applied. Only the E2E-specific and API-specific additions live here, plus the final handoff checklist that gates "ready for CI".

Severity model for all findings below matches the shared severity scale — CRITICAL (blocks merge), HIGH (blocks merge), MEDIUM (recommended), LOW (nice to have).

---

## Parallel verification dispatch (Phase 3 Review)

`bun run test`, `bun run type-check`, and `bun run lint` are independent — they don't share state — so dispatch all three simultaneously and aggregate.

**Three briefings**, each a Single Parallel subagent. Dispatch them in ONE tool-call block.

### Verifier A — test runner

```
Goal: Run the test suite and report failures grouped by file.
Context docs:
  - playwright.config.ts (project list)
  - <PBI_FOLDER>/test-specs/<scope>/spec.md (which ATCs should pass)
Skills to load: (none)
Exact instructions:
  1. Run: bun run test (the script declared in package.json invokes `playwright test`).
  2. Capture: total / passed / failed / skipped counts.
  3. For each failure: file, test name, error message (first 200 chars), trace path if available.
Report format:
  JSON: { "verifier": "test", "passed": <int>, "failed": <int>, "duration_seconds": <int>, "failures": [ { "file": "...", "test": "...", "error": "..." } ] }
Rules:
  - Do NOT edit any test code.
  - Do NOT retry failed tests.
```

### Verifier B — type-check

```
Goal: Run TypeScript compiler in noEmit mode and report errors.
Context docs:
  - tsconfig.json
Skills to load: (none)
Exact instructions:
  1. Run: bun run type-check (the script declared in package.json invokes `tsc --noEmit`).
  2. Capture every error: file:line:col, error code, message.
Report format:
  JSON: { "verifier": "type-check", "errors": [ { "file": "...", "line": ..., "col": ..., "code": "TS...", "message": "..." } ] }
Rules:
  - Do NOT auto-fix.
  - Strict mode is mandatory; do not relax tsconfig.
```

### Verifier C — lint

```
Goal: Run ESLint and report violations.
Context docs:
  - eslint.config.* / .eslintrc.*
Skills to load: (none)
Exact instructions:
  1. Run: bun run lint (the script declared in package.json invokes `eslint .`).
  2. Capture every violation: file:line, rule, message, severity.
Report format:
  JSON: { "verifier": "lint", "violations": [ { "file": "...", "line": ..., "rule": "...", "message": "...", "severity": "error|warning" } ] }
Rules:
  - Do NOT pass --fix.
  - Treat warnings as informational, errors as blockers.
```

### Aggregation in the main thread

After all three Verifiers return, the orchestrator:
1. Counts total blockers (failed tests + type errors + lint errors).
2. Decides: 0 blockers → merge candidate; >0 → reject + surface report to user.
3. If reject: presents the consolidated list to the user; does NOT auto-fix.

### Fallback to serial

If the test suite is large enough that running 3 verifiers in parallel saturates the machine (CPU/IO contention), fall back to serial. The dispatch overhead vs latency tradeoff flips below ~30s total runtime.

---

## 1. Before you review — apply the shared list first

Run these **three shared checklists first**, in order. They cover the rules that are identical for E2E and API tests: file naming, class extension, decorator placement, ATC identity, tuple returns, locator rule, max-2-positional-param rule, inline assertions, fixture registration, no relative imports, ticket-ID prefix, no `test.only`/`test.skip` left behind, no hardcoded waits.

1. **Component review** — `automation-standards.md` §10 → "Component review"
2. **ATC review** — `automation-standards.md` §10 → "ATC review"
3. **Test file review** — `automation-standards.md` §10 → "Test file review"

Only after the shared list is clean should you layer the deltas in §2 (E2E) or §3 (API) below. Do not merge a PR until both the shared checklist and the applicable delta are clean.

### Severity mapping at a glance

| Level | Examples in the deltas below |
|-------|-------------------------------|
| CRITICAL | Missing `@atc` / wrong tuple shape / no status-code assertion (API) / hardcoded `waitForTimeout` in E2E |
| HIGH | Brittle selector (nth-child, class-only) / missing type generic on `apiGET`/`apiPOST` / missing auth `beforeEach` on protected endpoint / no 401 coverage for protected routes |
| MEDIUM | Missing JSDoc / test not tagged / helper disguised as ATC / hand-rolled interface duplicating OpenAPI type |
| LOW | Import order / blank-line churn / variable naming |

### Output format

Keep reviewer output consistent across E2E and API:

```markdown
# Review: {TICKET-ID}

## Summary
| Category | Pass | Fail |
|----------|------|------|
| Shared (automation-standards §9) | … | … |
| Delta (this file §2 or §3) | … | … |

## Verdict
- [ ] APPROVED
- [ ] NEEDS REVISION (CRITICAL/HIGH present)
- [ ] MINOR CHANGES (only MEDIUM/LOW)

## Findings (by severity)
...
```

---

## 2. E2E-specific delta (UI / Playwright)

Apply these checks in addition to the shared list for any file under `tests/e2e/**` or any `*Page.ts` component.

### 2.1 Locator quality

| ID | Check | Severity |
|----|-------|----------|
| E-L1 | Locators prefer `data-testid` or `getByRole` before CSS / XPath. | HIGH |
| E-L2 | No brittle selectors: no `nth-child(...)`, no class-only selectors like `.btn.primary`, no deep descendant chains. | HIGH |
| E-L3 | Locators are specific enough that a parallel test cannot accidentally hit the same node. | MEDIUM |
| E-L4 | Locators live inline in the ATC. A selector reused in 2+ ATCs is promoted to a `private readonly` arrow function on the class — not to a `locators/*.ts` file. | CRITICAL (rejection reason in `automation-standards.md`) |
| E-L5 | Text selectors are wrapped so translations do not break the test (e.g. `getByRole('button', { name: /submit/i })`). | MEDIUM |

### 2.2 Waits and synchronisation

| ID | Check | Severity |
|----|-------|----------|
| E-W1 | No `page.waitForTimeout(n)` anywhere. Arbitrary sleeps are a CRITICAL reject. | CRITICAL |
| E-W2 | Waits are condition-based: `waitForSelector`, `waitForResponse`, `waitForLoadState('networkidle')`, or `expect(locator).toBeVisible()`. | CRITICAL |
| E-W3 | `data-loaded="true"` attributes or similar readiness flags are used where available. | MEDIUM |
| E-W4 | No reliance on Playwright retries to mask race conditions — `retries: 0` remains the local default. | HIGH |

### 2.3 Visual and content gotchas

| ID | Check | Severity |
|----|-------|----------|
| E-V1 | Text assertions avoid exact strings that vary by locale, time, or currency format — use regex or structural assertions. | MEDIUM |
| E-V2 | Toasts / notifications are awaited with `expect(toast).toBeVisible()` before assertion (they disappear). | HIGH |
| E-V3 | Screenshot assertions (`toHaveScreenshot`) are gated behind a Playwright project to avoid running on every test run unless intended. | MEDIUM |
| E-V4 | Viewport is set explicitly for tests that depend on responsive breakpoints. | LOW |

### 2.4 Session reuse and authentication

| ID | Check | Severity |
|----|-------|----------|
| E-S1 | Logged-in tests consume a storage state from auth setup — they do not re-run the login ATC per test. | HIGH |
| E-S2 | Each test that mutates user state uses a fresh user — no shared mutable logged-in session across tests. | HIGH |
| E-S3 | Session cookies or local-storage tokens are cleared in `beforeEach` for 401 / logged-out tests. | HIGH |

### 2.5 iframe, shadow DOM, new tabs

| ID | Check | Severity |
|----|-------|----------|
| E-F1 | iframe interactions use `page.frameLocator(...)`, not raw `page.$` on the outer document. | HIGH |
| E-F2 | Shadow-DOM nodes are reached through `locator(':light(...)')` or explicit `shadowRoot` chains — never by brittle CSS that happens to pierce the boundary. | HIGH |
| E-F3 | Popups / new tabs are awaited via `context.waitForEvent('page')`, not via fixed timeouts. | CRITICAL |
| E-F4 | File downloads use `page.waitForEvent('download')`. Uploads use `setInputFiles`. | HIGH |

### 2.6 Screenshot, trace, video policy

| ID | Check | Severity |
|----|-------|----------|
| E-T1 | Screenshots and traces are configured at the Playwright project level (`screenshot: 'only-on-failure'`, `trace: 'retain-on-failure'`) — not called manually inside ATCs. | MEDIUM |
| E-T2 | The ATC does not log raw passwords or tokens. The `@atc` decorator masks parameters whose keys are in the sensitive set — verify parameter names are canonical (`password`, `token`, `secret`). | HIGH |
| E-T3 | `page.screenshot()` inside a helper is deleted unless the screenshot is part of the test's explicit evidence contract. | MEDIUM |

### 2.7 Navigation

| ID | Check | Severity |
|----|-------|----------|
| E-N1 | `goto()` is a plain method (undecorated or `@step`), not an `@atc`. Navigation is not a test case. | HIGH |
| E-N2 | Absolute URLs are not hardcoded — use `this.buildUrl(path)` or the base URL from `@variables`. | HIGH |
| E-N3 | Back-button / history navigation is asserted explicitly when behaviour depends on it. | LOW |

---

## 3. API-specific delta (Integration / HTTP)

Apply these checks in addition to the shared list for any file under `tests/integration/**` or any `*Api.ts` component.

### 3.1 OpenAPI facade compliance

| ID | Check | Severity |
|----|-------|----------|
| A-O1 | Response and payload types come from `@schemas/{domain}.types` — no direct `@openapi` imports in the component. | HIGH |
| A-O2 | No hand-rolled interface duplicates a schema that already exists in the OpenAPI types file. If found, replace with the generated type. | MEDIUM |
| A-O3 | New endpoints are accompanied by a `bun run api:sync` so the generated types reflect the contract. | HIGH |
| A-O4 | `api/schemas/index.ts` re-exports any new domain added — otherwise `@schemas/{domain}` will fail to resolve. | HIGH |
| A-O5 | Error responses use `ApiErrorResponse` (or the project's canonical error type), not the success shape. | HIGH |

### 3.2 HTTP method and tuple discipline

| ID | Check | Severity |
|----|-------|----------|
| A-H1 | `apiGET<TBody>()`, `apiPOST<TBody, TPayload>()`, `apiPUT<TBody, TPayload>()`, `apiPATCH<TBody, TPayload>()`, `apiDELETE<TBody>()` — type generics always present. | HIGH |
| A-H2 | Return tuples match the HTTP verb — see expanded table below (§3.2.1). | CRITICAL |
| A-H3 | ATC `return` statement includes the payload on POST/PUT/PATCH — not just `[response, body]`. | CRITICAL |
| A-H4 | `baseEndpoint` constant is defined once per component; individual calls compose paths from it. | MEDIUM |

#### 3.2.1 Tuple-return contract per HTTP method

| Method | Return shape | Notes |
|---|---|---|
| `GET` (single) | `[APIResponse, TBody]` | `TBody` = resource DTO |
| `GET` (list) | `[APIResponse, TBody[]]` *or* `[APIResponse, ListResponse<TBody>]` | Use `ListResponse<T>` when the API wraps the collection with pagination metadata |
| `POST` | `[APIResponse, TBody, TPayload]` | `TPayload` = the body that was sent |
| `PUT` / `PATCH` | `[APIResponse, TBody, TPayload]` | Same shape as `POST` |
| `DELETE` | `[APIResponse, TBody]` | Default: the API echoes the deleted resource as `TBody`. **If the target API responds `204 No Content`, switch to `[APIResponse, void]` and document the choice at the top of the owning `*Api.ts` component** (one-line JSDoc is enough). Whichever shape applies, every `DELETE` ATC in the component must use it consistently. |

### 3.3 Status-code and body assertions

| ID | Check | Severity |
|----|-------|----------|
| A-A1 | Every ATC asserts the HTTP status code inline (`expect(response.status()).toBe(2xx/4xx/5xx)`). | CRITICAL |
| A-A2 | Every success ATC asserts at least one body invariant (an ID is set, a field is present, a state is correct). | CRITICAL |
| A-A3 | Inline assertions are invariants for the ATC — scenario-specific values (e.g. "email matches the signup payload") belong in the test file, not in the ATC. | HIGH |
| A-A4 | Error ATCs assert both the status code and the canonical error-contract shape (`errorCode`, `message`, `details[]` or equivalent). | HIGH |
| A-A5 | `expect` comes from `@playwright/test`, not from a custom assertion library. | MEDIUM |

### 3.4 Status-code coverage per endpoint

For every endpoint the component exposes, the test file (or sibling test files) must cover the realistic status codes. Missing coverage is not a CRITICAL per-file reject but gates the handoff — see §4.

| Method | Minimum expected coverage |
|--------|---------------------------|
| POST | 201 success + 400 validation + 401 unauthenticated (if protected) + 409 conflict (if applicable) |
| GET | 200 success + 404 not found + 401 unauthenticated (if protected) |
| PUT / PATCH | 200/204 success + 400 validation + 404 not found + 401 unauthenticated |
| DELETE | 204 success + 404 not found + 401 unauthenticated |

### 3.5 Error-contract assertions

| ID | Check | Severity |
|----|-------|----------|
| A-E1 | 400 tests assert a validation error shape (field-level error list if the API provides one). | HIGH |
| A-E2 | 401 tests call `api.clearAuthToken()` (or equivalent) before the request. | HIGH |
| A-E3 | 404 tests use an unambiguously non-existent identifier (a fresh UUID, not a magic "999"). | MEDIUM |
| A-E4 | 409 tests create the prior-state resource via a separate ATC (not via a direct DB write that bypasses business rules). | MEDIUM |
| A-E5 | 5xx responses, when expected, are treated as contract (stability tests) — otherwise the test should fail loudly, not swallow them. | HIGH |

### 3.6 Token / auth propagation

| ID | Check | Severity |
|----|-------|----------|
| A-T1 | `ApiFixture` forwards `setRequestContext`, `setAuthToken`, `clearAuthToken` to every child API component. A new component missing these wires is a reject. | CRITICAL |
| A-T2 | Tests requiring auth call an auth ATC in `beforeEach` — not inline in every test. | HIGH |
| A-T3 | Credentials come from `@variables` (resolved from `.env`). No hardcoded emails/passwords. | CRITICAL |
| A-T4 | Token rotation / refresh flows are exercised at least once for components that own them. | MEDIUM |

### 3.7 Request / response schema validation

| ID | Check | Severity |
|----|-------|----------|
| A-R1 | Request payloads are typed — no `any`, no partial objects cast to the payload type. | HIGH |
| A-R2 | Response body is asserted against the declared type structurally (not just "is truthy"). | HIGH |
| A-R3 | Pagination shape is asserted where lists are returned (`items`, `total`, `page` or the project's canonical envelope). | MEDIUM |
| A-R4 | Dates and UUIDs are validated with regex or Playwright matchers, not just `expect(x).toBeDefined()`. | LOW |
| A-R5 | Allure request/response attachments are produced by `ApiBase` automatically — no manual `testInfo.attach()` calls littering the ATC. | LOW |

### 3.8 Helper vs ATC discipline (API-specific)

| ID | Check | Severity |
|----|-------|----------|
| A-D1 | Read-only GET used as a precondition is a plain helper (no decorator or `@step`), not `@atc`. A GET that is the subject of the test is an `@atc`. | HIGH |
| A-D2 | Data-seeding helpers that orchestrate multiple resources live under `tests/components/steps/`, not inside an API component. | HIGH |
| A-D3 | `api.data.*` factories generate payloads. No hand-built payload literals in the test body. | MEDIUM |

---

## 4. Handoff checklist — "ready for CI"

Before marking the ticket complete and opening the PR, **every** box below must be true. A single unchecked item means NEEDS REVISION.

### 4.1 Code state

- [ ] Shared checklist (`automation-standards.md` §10) — zero CRITICAL, zero HIGH.
- [ ] Applicable delta (§2 E2E or §3 API) — zero CRITICAL, zero HIGH.
- [ ] `bun run test <path>` — green, zero retries used.
- [ ] `bun run type-check` — no errors.
- [ ] `bun run lint` — no errors.
- [ ] Component registered in `ApiFixture` / `UiFixture` / `StepsFixture` as appropriate.
- [ ] Every `@atc('X')` resolves to a real TMS ticket (spot-check 2 random IDs).

### 4.2 Test coverage

- [ ] Happy path covered.
- [ ] All realistic error cases from §3.4 covered (API) or all primary UI error states covered (E2E): empty state, loading state, error banner, disabled CTA.
- [ ] Auth-failure test present if the feature is behind auth.
- [ ] At least one test tagged `@critical` or `@smoke` if the feature is in the release-blocking set.

### 4.3 Data and environment

- [ ] No hardcoded credentials — `@variables` / `.env` only.
- [ ] No hardcoded production-like IDs — Faker or `api.data.*`.
- [ ] `.env.example` updated if new variables were introduced.
- [ ] `bun run api:sync` run if the OpenAPI contract changed.

### 4.4 Traceability

- [ ] Ticket-ID prefix present in both `describe` and every `test()`.
- [ ] `@atc` decorators present on every state-changing ATC.
- [ ] `bun run kata:manifest` — component and ATCs appear with expected IDs.
- [ ] TMS test case is linked (either via `@atc` ID already in TMS, or a follow-up documented in the PR body).

### 4.5 Hygiene

- [ ] No `test.only`, no `test.skip`, no leftover `console.log` debugging.
- [ ] No commented-out code or placeholder TODOs without an owner.
- [ ] Commit message follows semantic prefix (`test:`, `feat:`, `fix:`, `refactor:`) and has no AI attribution lines.

### 4.6 CI preflight (for the PR)

- [ ] File paths align with the project layout (`tests/e2e/{module}/...` or `tests/integration/{module}/...`).
- [ ] Tests do not depend on local-only services that CI lacks (or such dependencies are documented).
- [ ] Project-level config (`playwright.config.ts` projects array) already covers the folder the new tests live in — otherwise the tests will not run in CI.

When every box is checked, the ticket is handed over to CI via the standard PR flow. If CI fails, return to Phase 2 Code; do not patch the PR with new conventions mid-review.

---

## Appendix · Legacy code cross-reference

For PR comments that reference the legacy boilerplate's flat check IDs (`.prompts/stage-5-automation/review/*`). The current refactor split the 29+ flat checks into a shared list (`automation-standards.md` §10) plus deltas (this file). Use this table to resolve historical references.

| Legacy code | Scope | New location |
|---|---|---|
| K-01 | KATA — component extends `UiBase`/`ApiBase` | `automation-standards.md` §10 / Component review |
| K-02 | KATA — no direct Playwright imports in components | `automation-standards.md` §10 / Component review |
| K-03 | KATA — imports via aliases (`@api/`, `@schemas/`, `@utils/`) | `automation-standards.md` §10 / Component review |
| K-04 | KATA — ATCs return tuples or meaningful values | `review-checklists.md` §3.2 (A-H) + §3.2.1 |
| K-05 | KATA — `@atc('ID')` tags present on state-changing methods | `automation-standards.md` §10 / ATC review |
| K-06 | KATA — Steps module for reusable chains, not ATC-to-ATC calls | `automation-standards.md` §10 / Test file review |
| K-07 | KATA — fixture selection (`{ api }` / `{ ui }` / `{ test }`) | `review-checklists.md` §2.4 + §3.6 |
| K-08 | KATA — `TestContext` usage (config, faker) | `automation-standards.md` §10 / Component review |
| K-09 | KATA — no duplicated helpers between components | `automation-standards.md` §10 / Component review |
| A-01 … A-08 | ATC rules (atomicity, max 2 positional params, fixed vs test-level assertions, Equivalence Partitioning) | `automation-standards.md` §10 / ATC review |
| T-01 … T-05 | TypeScript rules (parameter count, inline locators, alias imports, interface placement, silent-fail utilities) | `test-automation/references/typescript-patterns.md` |

**Collision note**: the current local codes `A-xx` in §3 (API deltas: A-O, A-H, A-A, A-E, A-T, A-R, A-D) share a prefix with the legacy `A-01..A-08` (ATC rules) but have a different scope. Always read the containing section heading — the legacy meaning is the ATC-rules set under *shared* review (`automation-standards.md` §10), not the API delta.
