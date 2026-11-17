# Review Checklists: E2E and API Deltas

Load during Phase 3 (Review) of the Plan, Code, Review pipeline. A review answers two separate questions: did the tests deliver what the plan asked for, and do they meet the KATA standards. This file says how to run that review, and holds the E2E-specific and API-specific checks plus the handoff checklist that gates "ready for CI". It is a delta: the shared KATA checklists in `automation-standards.md` §10 (Component review, ATC review, Test file review) are applied first, and only the additions live here.

Severity matches the shared scale: CRITICAL and HIGH block merge, MEDIUM is recommended, LOW is nice to have.

---

## Parallel verification dispatch (Phase 3 Review)

`bun run test`, `bun run types:check` and `bun run lint:check` share no state, so dispatch all three at once and aggregate. Each briefing is a Single Parallel subagent, and all three go out in one tool-call block.

### Verifier A: test runner

```
Goal: Run the test suite and report failures grouped by file.
Context docs:
  - playwright.config.ts (project list)
  - .context/PBI/epics/EPIC-<KEY>-<slug>/test-specs/<scope>/spec.md (which ATCs should pass)
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

### Verifier B: type-check

```
Goal: Run TypeScript compiler in noEmit mode and report errors.
Context docs:
  - tsconfig.json
Skills to load: (none)
Exact instructions:
  1. Run: bun run types:check (the script declared in package.json invokes `tsc --noEmit`).
  2. Capture every error: file:line:col, error code, message.
Report format:
  JSON: { "verifier": "type-check", "errors": [ { "file": "...", "line": ..., "col": ..., "code": "TS...", "message": "..." } ] }
Rules:
  - Do NOT auto-fix.
  - Strict mode is mandatory; do not relax tsconfig.
```

### Verifier C: lint

```
Goal: Run ESLint and report violations.
Context docs:
  - eslint.config.* / .eslintrc.*
Skills to load: (none)
Exact instructions:
  1. Run: bun run lint:check (the script declared in package.json invokes `eslint .`).
  2. Capture every violation: file:line, rule, message, severity.
Report format:
  JSON: { "verifier": "lint", "violations": [ { "file": "...", "line": ..., "rule": "...", "message": "...", "severity": "error|warning" } ] }
Rules:
  - Do NOT pass --fix.
  - Treat warnings as informational, errors as blockers.
```

### Aggregation in the main thread

When the three Verifiers and the two axis reviewers (next section) have returned, the orchestrator counts blockers: failed tests, type errors, lint errors, and every CRITICAL or HIGH finding from either axis. Zero blockers makes a merge candidate. Any blocker rejects the change.

On a reject the orchestrator does not auto-fix. It presents the consolidated list and waits for the next move:

| Who is there | Path |
|---|---|
| A person | The list goes to them. |
| A supervised worker | The list goes to the conductor, which holds the gate. |
| A routine with nobody | The list goes into the report and the run stops with the work left unmerged, since a merge is irreversible and outward. |

Who decides what a worker may settle alone is in `agentic-qa-core/references/decision-protocol.md`.

### Fallback to serial

When three parallel verifiers saturate the machine (CPU or IO contention), run them serially. The dispatch overhead outweighs the latency gain below about 30 seconds of total runtime.

---

## Two-axis review (Phase 3 Review)

A change can pass one axis and fail the other. Tests that follow every KATA rule but check the wrong behaviour pass Standards and fail Spec. Tests that cover the plan but break the conventions do the reverse. One reviewer holding both questions lets the first answer color the second, so two reviewers answer them separately, each in a fresh context, in parallel with the three Verifiers.

| Axis | Question | Reads | Does not read |
|---|---|---|---|
| Spec compliance | Do the tests deliver what the plan and the ticket asked for? | the diff, `spec.md`, `automation-plan.md`, `atc/*.md` and the in-scope TC bodies (under `.context/PBI/epics/EPIC-<KEY>-<slug>/test-specs/<scope>/`), the ticket's ACs, and the LT-1 and LT-2 rows of the lying-tests table below | `automation-standards.md`, the rest of this file |
| Standards | Do the tests meet KATA and the delta checks below? | the diff, `automation-standards.md` §10, this file's §1 to §3, the LT-3 row of the lying-tests table | the spec and the ACs |

The KATA standards live in files only the Standards reviewer reads. The orchestrator and the Spec reviewer never load them, so neither is tempted to grade convention in place of behaviour. The lying-tests split follows what each axis can see: tautology and cannot-fail need the spec to know where the expected value should come from (Spec), structure sensitivity is a KATA locator and assertion matter (Standards). Each reviewer gets the diff command, the commit list and the files for its own axis, and returns a report of about 400 words.

Both briefs use the same 7-component shape as Verifiers A to C. The goal and the report format differ, the rest is shared.

```
Spec reviewer
Goal: Check the diff against the approved plan and the TC bodies, and find lying tests (LT-1, LT-2).
Context docs: the files in the Spec row above.
Skills to load: (none)
Exact instructions:
  1. Run the diff command from the briefing.
  2. Report planned ATCs or ACs with no test, or only a partial one.
  3. Report tests that cover behaviour nobody asked for (scope creep).
  4. Report tests that look like they cover a requirement but check something else.
  5. Report risk-beyond-AC coverage the plan promised (boundaries, state transitions, auth failure) that is missing.
  6. Apply LT-1 and LT-2 to every new assertion.
Report format: about 400 words, each finding quoting the plan, AC or TC line, with severity and file:line.
Rules:
  - Do NOT read the standards.
  - Do NOT edit code.

Standards reviewer
Goal: Check the diff against the KATA standards and find structure-sensitive tests (LT-3).
Context docs: the files in the Standards row above.
Skills to load: (none)
Exact instructions:
  1. Run the diff command from the briefing.
  2. Apply `automation-standards.md` §10, then the E2E delta (§2) or the API delta (§3), then LT-3.
  3. Skip what lint or the type checker already enforces.
     The table `Already enforced by lint` below names the rules.
Report format: about 400 words, each failure with its check ID, severity, file and line.
Rules:
  - Do NOT read the spec or the ACs.
  - Do NOT edit code.
```

The reports stay separate. Do not merge or re-rank them: each axis keeps its own worst finding, and the verdict counts blockers from both. When no spec exists, say so in the report and let the Standards axis run alone.

This split does not replace the required separate verifier in `SKILL.md` Phase 3 (`/pr-review-lead` or `/judgment-day`). It makes the in-skill review sharper before that verifier runs.

### Already enforced by lint

Rule ids are in `eslint.config.base.js` (`KATA_ENFORCEMENT_LEVEL` sets the severity). A reviewer reads the lint output for these and spends the review on what a machine cannot judge.

| Checklist item | Rule |
|---|---|
| E-W1 arbitrary sleep, E-W2 waits | `playwright/no-wait-for-timeout`, `no-wait-for-selector`, `no-networkidle` |
| LT-2 assertion in a branch, missing `await` on an assertion (partial) | `playwright/no-conditional-expect`, `missing-playwright-await`, `no-useless-not` |
| LT-3 `nth` positions (partial) | `playwright/no-nth-methods` |
| `force: true`, `.only`, `.skip`, `page.pause()`, element handles | `playwright/no-force-option`, `no-focused-test`, `no-skipped-test`, `no-page-pause`, `no-element-handle` |
| Layer imports, faker and `@openapi` homes, `test` from `@TestFixture` | `kata/layer-imports` |
| Rule 5, an ATC calls an ATC | `kata/atc-no-atc-call` |
| Raw `page` or `request` in a spec | `kata/no-raw-page-in-spec` |
| Decorators in a Base | `kata/no-decorator-in-base` |
| More than 2 positional params, oversized component | `max-params`, `max-lines` |

### Lying tests

A green test is evidence only if it could have been red. The Spec reviewer checks LT-1 and LT-2 and the Standards reviewer checks LT-3. All three are findings, whatever the KATA checklist says about the same file:

| ID | Check | Severity |
|----|-------|----------|
| LT-1 | Tautological: the expected value is computed the way the code computes it (the same factory, the same formula, the same helper), or the test compares a value to the input it just set without any round trip through the product. It passes by construction. Expected values come from an independent source: a literal, a worked example, the spec. A server echoing the sent payload is a legitimate round trip, since the product produced the value. | HIGH |
| LT-2 | Cannot fail: no product change would turn it red. Examples: `toBeDefined()` or `toBeTruthy()` as the only body check, an assertion inside an `if` or a `try/catch` that swallows it, a missing `await` on an assertion, a locator count compared with `>= 0`, a test whose only ATC asserts nothing. Ask which product change would break it; if you cannot name one, it is a finding. | CRITICAL |
| LT-3 | Structure-sensitive: it breaks on a refactor that leaves behaviour intact. Examples: assertions on CSS classes, DOM order or `nth-child` positions, exact key order of a response, a whole-body snapshot where two fields matter, internal call counts. Assert the behaviour a user or a consumer sees. | HIGH |

---

## 1. Before you review: apply the shared list first

The Standards reviewer runs these three shared checklists first, in order. They cover the rules identical for E2E and API tests: file naming, class extension, decorator placement, ATC identity, tuple returns, the locator rule, the two-positional-parameter limit, inline assertions, fixture registration, no relative imports, ticket-ID prefix, no leftover `test.only` or `test.skip`, no hardcoded waits.

1. Component review: `automation-standards.md` §10, "Component review"
2. ATC review: `automation-standards.md` §10, "ATC review"
3. Test file review: `automation-standards.md` §10, "Test file review"

Layer the deltas in §2 (E2E) or §3 (API) only once the shared list is clean. A PR merges only when the shared checklist and the applicable delta are both clean.

### Severity mapping at a glance

| Level | Examples in the deltas below |
|-------|-------------------------------|
| CRITICAL | Missing `@atc`, wrong tuple shape, no status-code assertion (API), hardcoded `waitForTimeout` in E2E, a test that cannot fail (LT-2) |
| HIGH | Brittle selector (nth-child, class-only), missing type generic on `apiGET`/`apiPOST`, missing auth `beforeEach` on a protected endpoint, no 401 coverage for protected routes, a tautological or structure-sensitive test (LT-1, LT-3) |
| MEDIUM | Missing JSDoc, test not tagged, helper disguised as ATC, hand-rolled interface duplicating an OpenAPI type |
| LOW | Import order, blank-line churn, variable naming |

### Output format

Reviewer output has one shape for E2E and API. Each finding names its axis (Spec or Standards).

```markdown
# Review: {TICKET-ID}

## Summary
| Category | Pass | Fail |
|----------|------|------|
| Spec compliance | … | … |
| Shared (automation-standards §10) | … | … |
| Delta (this file §2 or §3) | … | … |
| Lying tests (LT-1 to LT-3) | … | … |

## Verdict
- [ ] APPROVED
- [ ] NEEDS REVISION (CRITICAL/HIGH present)
- [ ] MINOR CHANGES (only MEDIUM/LOW)

## Findings (by severity)
...
```

---

## 2. E2E-specific delta (UI / Playwright)

Apply these on top of the shared list for any file under `tests/e2e/**` or any `*Page.ts` component.

### 2.1 Locator quality

| ID | Check | Severity |
|----|-------|----------|
| E-L1 | Locators prefer `data-testid` or `getByRole` before CSS / XPath. | HIGH |
| E-L2 | No brittle selectors: no `nth-child(...)`, no class-only selectors like `.btn.primary`, no deep descendant chains. | HIGH |
| E-L3 | Locators are specific enough that a parallel test cannot accidentally hit the same node. | MEDIUM |
| E-L4 | Locators live inline in the ATC. A selector reused in 2+ ATCs is promoted to a `private readonly` arrow function on the class, never to a `locators/*.ts` file. | CRITICAL (rejection reason in `automation-standards.md`) |
| E-L5 | Text selectors are wrapped so translations do not break the test (e.g. `getByRole('button', { name: /submit/i })`). | MEDIUM |

### 2.2 Waits and synchronisation

| ID | Check | Severity |
|----|-------|----------|
| E-W1 | No `page.waitForTimeout(n)` anywhere. An arbitrary sleep is a CRITICAL reject. | CRITICAL |
| E-W2 | Waits are condition-based: `waitForResponse`, an auto-waiting locator action or `expect(locator).toBeVisible()`. `waitForSelector` and `networkidle` are lint-flagged. | CRITICAL |
| E-W3 | `data-loaded="true"` attributes or similar readiness flags are used where available. | MEDIUM |
| E-W4 | No reliance on Playwright retries to mask race conditions: `retries: 0` holds locally and in CI. | HIGH |

### 2.3 Visual and content gotchas

| ID | Check | Severity |
|----|-------|----------|
| E-V1 | Text assertions avoid exact strings that vary by locale, time, or currency format, use regex or structural assertions. | MEDIUM |
| E-V2 | Toasts / notifications are awaited with `expect(toast).toBeVisible()` before assertion (they disappear). | HIGH |
| E-V3 | Screenshot assertions (`toHaveScreenshot`) are gated behind a Playwright project to avoid running on every test run unless intended. | MEDIUM |
| E-V4 | Viewport is set explicitly for tests that depend on responsive breakpoints. | LOW |

### 2.4 Session reuse and authentication

| ID | Check | Severity |
|----|-------|----------|
| E-S1 | Logged-in tests consume a storage state from auth setup, they do not re-run the login ATC per test. | HIGH |
| E-S2 | Each test that mutates user state uses a fresh user, no mutable logged-in session is shared across tests. | HIGH |
| E-S3 | Session cookies or local-storage tokens are cleared in `beforeEach` for 401 / logged-out tests. | HIGH |

### 2.5 iframe, shadow DOM, new tabs

| ID | Check | Severity |
|----|-------|----------|
| E-F1 | iframe interactions use `page.frameLocator(...)`, not raw `page.$` on the outer document. | HIGH |
| E-F2 | Shadow-DOM nodes are reached through `locator(':light(...)')` or explicit `shadowRoot` chains, never by brittle CSS that happens to pierce the boundary. | HIGH |
| E-F3 | Popups / new tabs are awaited via `context.waitForEvent('page')`, not via fixed timeouts. | CRITICAL |
| E-F4 | File downloads use `page.waitForEvent('download')`. Uploads use `setInputFiles`. | HIGH |

### 2.6 Screenshot, trace, video policy

| ID | Check | Severity |
|----|-------|----------|
| E-T1 | Screenshots and traces are configured at the Playwright project level (`screenshot: 'only-on-failure'`, `trace: 'retain-on-failure'`), not called by hand inside ATCs. | MEDIUM |
| E-T2 | The ATC does not log raw passwords or tokens. The `@atc` decorator masks parameters whose keys are in the sensitive set, verify parameter names are canonical (`password`, `token`, `secret`). | HIGH |
| E-T3 | `page.screenshot()` inside a helper is deleted unless the screenshot is part of the test's explicit evidence contract. | MEDIUM |

### 2.7 Navigation

| ID | Check | Severity |
|----|-------|----------|
| E-N1 | `goto()` is a plain method (undecorated or `@step`), not an `@atc`. Navigation is not a test case. | HIGH |
| E-N2 | Absolute URLs are not hardcoded; use `this.buildUrl(path)` or the base URL from `@variables`. | HIGH |
| E-N3 | Back-button / history navigation is asserted explicitly when behaviour depends on it. | LOW |

---

## 3. API-specific delta (Integration / HTTP)

Apply these on top of the shared list for any file under `tests/integration/**` or any `*Api.ts` component.

### 3.1 OpenAPI facade compliance

| ID | Check | Severity |
|----|-------|----------|
| A-O1 | Response and payload types come from `@schemas/{domain}.types`, no direct `@openapi` imports in the component. | HIGH |
| A-O2 | No hand-rolled interface duplicates a schema that already exists in the OpenAPI types file. If found, replace with the generated type. | MEDIUM |
| A-O3 | New endpoints are accompanied by a `bun run api:sync` so the generated types reflect the contract. | HIGH |
| A-O4 | `api/schemas/index.ts` re-exports any new domain added, otherwise `@schemas/{domain}` will fail to resolve. | HIGH |
| A-O5 | Error responses use `ApiErrorResponse` (or the project's canonical error type), not the success shape. | HIGH |

### 3.2 HTTP method and tuple discipline

| ID | Check | Severity |
|----|-------|----------|
| A-H1 | `apiGET<TBody>()`, `apiPOST<TBody, TPayload>()`, `apiPUT<TBody, TPayload>()`, `apiPATCH<TBody, TPayload>()`, `apiDELETE<TBody>()`, type generics always present. | HIGH |
| A-H2 | Return tuples match the HTTP verb, see expanded table below (§3.2.1). | CRITICAL |
| A-H3 | ATC `return` statement includes the payload on POST/PUT/PATCH, not just `[response, body]`. | CRITICAL |
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
| A-A3 | Inline assertions are invariants for the ATC, scenario-specific values (e.g. "email matches the signup payload") belong in the test file, not in the ATC. | HIGH |
| A-A4 | Error ATCs assert both the status code and the canonical error-contract shape (`errorCode`, `message`, `details[]` or equivalent). | HIGH |
| A-A5 | `expect` comes from `@playwright/test`, not from a custom assertion library. | MEDIUM |

### 3.4 Status-code coverage per endpoint

For every endpoint the component exposes, the test file (or sibling test files) must cover the realistic status codes. Missing coverage is not a CRITICAL per-file reject, but it gates the handoff (§4).

| Method | Minimum expected coverage |
|--------|---------------------------|
| POST | 201 success + 400 validation + 401 unauthenticated (if protected) + 409 conflict (if applicable) |
| GET | 200 success + 404 not found + 401 unauthenticated (if protected) |
| PUT / PATCH | 200/204 success + 400 validation + 404 not found + 401 unauthenticated |
| DELETE | 204 success + 404 not found + 401 unauthenticated |

> Status codes are the auth and protocol layer of risk-beyond-AC. They are necessary but not sufficient: §3.4.1 (data boundaries) and §3.4.2 (state and temporal) cover the rest. Full canon: `agentic-qa-core/references/test-design-doctrine.md`.

### 3.4.1 Input-domain coverage (EP + BVA), gates handoff

| ID | Check | Severity |
|----|-------|----------|
| A-B1 | Each request field with a **range / limit / length** has boundary ATCs: `min-1·min·min+1` and `max-1·max·max+1` (parameterized). EP-merge does NOT satisfy this. | HIGH |
| A-B2 | Empty / null / missing-required-field cases produce the expected 400 (one ATC per distinct invalid partition, not one lump "invalid" test). | HIGH |
| A-B3 | Type/format violations (string where number, malformed date, oversized payload, unicode/emoji) are covered where the field accepts free input. | MEDIUM |
| A-B4 | If no field has a range/limit, this section is explicitly marked N/A in the plan, not silently skipped. | LOW |

### 3.4.2 State-transition & temporal coverage, gates handoff

| ID | Check | Severity |
|----|-------|----------|
| A-S1 | Stateful entities (status/lifecycle) have an ATC per valid transition AND per invalid transition (trigger fired in a state that should reject it). | HIGH |
| A-S2 | Idempotency / double-submit is exercised for mutating endpoints that must be safe to retry. | MEDIUM |
| A-S3 | Concurrency (two writers on the same resource, expecting 409 or last-write-wins) is covered where the AC or domain implies it. | MEDIUM |
| A-S4 | Timeout / retry / partial-failure rollback is covered for flows with external dependencies. | MEDIUM |

### 3.5 Error-contract assertions

| ID | Check | Severity |
|----|-------|----------|
| A-E1 | 400 tests assert a validation error shape (field-level error list if the API provides one). | HIGH |
| A-E2 | 401 tests call `api.clearAuthToken()` (or equivalent) before the request. | HIGH |
| A-E3 | 404 tests use an unambiguously non-existent identifier (a fresh UUID, not a magic "999"). | MEDIUM |
| A-E4 | 409 tests create the prior-state resource via a separate ATC (not via a direct DB write that bypasses business rules). | MEDIUM |
| A-E5 | 5xx responses, when expected, are treated as contract (stability tests), otherwise the test should fail loudly, not swallow them. | HIGH |

### 3.6 Token / auth propagation

| ID | Check | Severity |
|----|-------|----------|
| A-T1 | `ApiFixture` overrides `setAuthToken` and `clearAuthToken` and forwards BOTH to every child API component. A new component missing either wire is a reject, because it keeps a stale token after the fixture cleared one. The request context is NOT forwarded, it arrives through the constructor (`new XApi(options)`), so there is no `setRequestContext` to check. | CRITICAL |
| A-T2 | Tests requiring auth call an auth ATC in `beforeEach`, not inline in every test. | HIGH |
| A-T3 | Credentials come from `@variables` (resolved from `.env`). No hardcoded emails/passwords. | CRITICAL |
| A-T4 | Token rotation / refresh flows are exercised at least once for components that own them. | MEDIUM |

### 3.7 Request / response schema validation

| ID | Check | Severity |
|----|-------|----------|
| A-R1 | Request payloads are typed, no `any`, no partial objects cast to the payload type. | HIGH |
| A-R2 | Response body is asserted against the declared type structurally (not just "is truthy"). | HIGH |
| A-R3 | Pagination shape is asserted where lists are returned (`items`, `total`, `page` or the project's canonical envelope). | MEDIUM |
| A-R4 | Dates and UUIDs are validated with regex or Playwright matchers, not just `expect(x).toBeDefined()`. | LOW |
| A-R5 | Allure request/response attachments are produced by `ApiBase` automatically, no manual `testInfo.attach()` calls littering the ATC. | LOW |

### 3.8 Helper vs ATC discipline (API-specific)

| ID | Check | Severity |
|----|-------|----------|
| A-D1 | Read-only GET used as a precondition is a plain helper (no decorator or `@step`), not `@atc`. A GET that is the subject of the test is an `@atc`. | HIGH |
| A-D2 | Data-seeding helpers that orchestrate multiple resources live under `tests/components/steps/`, not inside an API component. | HIGH |
| A-D3 | `api.data.*` factories generate payloads. No hand-built payload literals in the test body. | MEDIUM |

---

## 4. Handoff checklist: "ready for CI"

Before marking the ticket complete and opening the PR, every box below is true. One unchecked item means NEEDS REVISION.

### 4.1 Code state

- [ ] Spec axis: every planned ATC and AC has a test, and no test sits outside the plan.
- [ ] Shared checklist (`automation-standards.md` §10): zero CRITICAL, zero HIGH.
- [ ] Applicable delta (§2 E2E or §3 API): zero CRITICAL, zero HIGH.
- [ ] No lying tests (LT-1 to LT-3).
- [ ] `bun run test <path>` is green with zero retries used.
- [ ] `bun run types:check` reports no errors.
- [ ] `bun run lint:check` reports no errors.
- [ ] Component registered in `ApiFixture` / `UiFixture` as appropriate (Steps classes are instantiated directly in tests, with no fixture registration).
- [ ] Every `@atc('X')` resolves to a real TMS ticket (spot-check 2 random IDs).

### 4.2 Test coverage

- [ ] Happy path covered.
- [ ] All realistic error cases from §3.4 covered (API) or all primary UI error states covered (E2E): empty state, loading state, error banner, disabled CTA.
- [ ] Input-domain boundaries (§3.4.1, EP + BVA) covered or explicitly N/A.
- [ ] State transitions + temporal/concurrency risks (§3.4.2) covered or explicitly N/A.
- [ ] Coverage exceeds the AC floor: risk-beyond-AC cases present (not just "every AC has a green test").
- [ ] Auth-failure test present if the feature is behind auth.
- [ ] At least one test tagged `@critical` or `@smoke` if the feature is in the release-blocking set.

### 4.3 Data and environment

- [ ] No hardcoded credentials: `@variables` and `.env` only.
- [ ] No hardcoded production-like IDs: Faker or `api.data.*`.
- [ ] `.env.example` updated if new variables were introduced.
- [ ] `bun run api:sync` run if the OpenAPI contract changed.

### 4.4 Traceability

- [ ] Ticket-ID prefix present in both `describe` and every `test()`.
- [ ] `@atc` decorators present on every state-changing ATC.
- [ ] `bun run kata:manifest` lists the component and its ATCs with the expected IDs.
- [ ] TMS test case is linked (either via `@atc` ID already in TMS, or a follow-up documented in the PR body).

### 4.5 Hygiene

- [ ] No `test.only`, no `test.skip`, no leftover `console.log` debugging.
- [ ] No commented-out code or placeholder TODOs without an owner.
- [ ] Commit message follows semantic prefix (`test:`, `feat:`, `fix:`, `refactor:`) and has no AI attribution lines.

### 4.6 CI preflight (for the PR)

- [ ] File paths align with the project layout (`tests/e2e/{module}/...` or `tests/integration/{module}/...`).
- [ ] Tests do not depend on local-only services that CI lacks (or such dependencies are documented).
- [ ] The `playwright.config.ts` projects array already covers the folder the new tests live in; otherwise they will not run in CI.

With every box checked, the ticket goes to CI through the standard PR flow. If CI fails, return to Phase 2 Code and do not patch the PR with new conventions mid-review.
