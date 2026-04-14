---
name: test-automation
description: Plan, write, and review automated tests following KATA (Component Action Test Architecture) on Playwright + TypeScript. Use when writing E2E or API/integration tests, creating Page or Api components, designing ATCs, parameterizing test data, registering fixtures, or reviewing test code for KATA compliance. Triggers on: write test, automate test, create E2E test, create API test, integration test, KATA, page object, API component, implementation plan, ATC, automated test case, review test code, automate module, automate ticket, add regression test. Always load before writing any test code -- KATA fixture selection, inline-locator rule, ATC-identity rule, and import-alias requirements differ from standard Playwright conventions. Do NOT use for running suites (regression-testing), documenting TCs in Jira/Xray (test-documentation), onboarding a repo (project-discovery), or orchestrating sprint-wide testing (sprint-testing).
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
---

# Test Automation — Plan, Code, Review

Produce KATA-compliant automated tests for an existing Playwright + TypeScript project. Three phases, always in this order: **Plan → Code → Review**. Never jump straight to code.

KATA (Component Action Test Architecture) rewires the usual Page Object pattern. If you write tests the "standard" way, most will be rejected at review. Load the relevant reference before writing code in that area.

---

## Pick the planning scope first

Every automation session starts by choosing one of three planning scopes. Pick once, then follow the Plan → Code → Review pipeline.

| Scope | Input | Output | Use when |
|-------|-------|--------|----------|
| **Module-driven** (Macro) | A module name + list of candidate TCs | One module spec + N ATC specs | Batch-automating an entire module (10+ tests). First pass on a new area. |
| **Ticket-driven** (Medium) | A single ticket/story ID with scenarios | One implementation plan for that ticket | Automating one user story end-to-end. Default for sprint work. |
| **Regression-driven** (Micro) | One specific TC (often after a bug fix) | One ATC implementation plan | Adding a single regression test after a fix. Smallest unit of work. |

When in doubt, ask the user which scope. Never assume "module" just because multiple TC IDs appear in the briefing.

---

## Workflow — Plan → Code → Review

```
Phase 1: Plan         -> Phase 2: Code             -> Phase 3: Review
(spec / plan)            (component + test file)      (KATA compliance)
        |                         |                             |
  .context/PBI/{module}/     tests/components/**         Review checklist
    test-specs/              tests/e2e/** or                (pass/fail)
    spec.md                  tests/integration/**
    implementation-plan.md
    atc/*.md                 Register in fixture
```

Each phase has a gate. Do not start Code before the Plan is written and approved. Do not close out a ticket until Review passes.

### Phase 1 — Plan

Write the plan file(s) for the chosen scope under `.context/PBI/{module}/test-specs/{TICKET-ID}/`. The plan answers:

- Which scenarios from the ticket become tests, which become ATCs, which are shared preconditions (Steps)?
- Which components already exist (`tests/components/api/*Api.ts`, `tests/components/ui/*Page.ts`) and which need to be created?
- What test data is required? Classify by Discover / Modify / Generate (never assume data exists in staging).
- Which fixture will the test use -- `{api}`, `{ui}`, `{test}`, or `{steps}`?
- Which ATC IDs (from the TMS) map to which component methods?

Present the plan to the user. Wait for approval before coding.

### Phase 2 — Code

Implement in this order:

1. **Types** at top of component file (payloads, responses, domain DTOs).
2. **Component class** extending `ApiBase` or `UiBase`. Helpers first (no decorator), ATCs second (`@atc('TICKET-ID')`).
3. **Register** the component in `tests/components/ApiFixture.ts`, `UiFixture.ts`, or `StepsFixture.ts` as appropriate.
4. **Test file** under `tests/e2e/{module}/` or `tests/integration/{module}/`, using the correct fixture.
5. **Run + verify**, in this exact order -- do not skip steps:

```bash
bun run test <path/to/new.test.ts>   # does it pass?
bun run type-check                   # tsc --noEmit, no errors
bun run lint                         # ESLint, no errors
```

If any step fails, fix before moving to Review.

### Phase 3 — Review

Run the review checklist on the new/modified files. Treat every failed item as a blocker. A clean review is the merge gate. See `references/review-checklists.md` for the full lists (E2E and API have overlapping but distinct checklists).

---

## Fixture selection (inline — load-bearing every invocation)

The fixture you pick determines whether a browser opens. Wrong fixture = slow API tests or missing UI context.

| Test type | Fixture | Browser opens? | Use when |
|-----------|---------|----------------|----------|
| API only (integration) | `{ api }` | No (lazy) | Pure API testing. No UI needed. |
| UI only | `{ ui }` | Yes | UI-focused testing. No backend setup via API. |
| Hybrid (UI + API setup) | `{ test }` | Yes | Setup data via API, drive flow via UI, verify via API. |
| Reusable precondition chains | `{ steps }` | Depends on steps used | 3+ ATCs repeated across 3+ files. |

Rules:

- Integration tests (`tests/integration/**`) almost always use `{ api }`.
- E2E tests (`tests/e2e/**`) use `{ ui }` if no API setup needed, otherwise `{ test }`.
- Never request `{ ui }` for a test that never interacts with the UI -- it opens a browser for nothing.

---

## Gotchas (inline — the most common rejection reasons)

1. **ATC = complete test case, not a single click.** `clickLoginButton()` is not an ATC. `loginWithValidCredentials(credentials)` is. If the method is one-line-wrapping `page.click()`, delete it.
2. **TC Identity Rule: Precondition + Action = 1 TC.** All expected results from the same precondition and same action are assertions of the same TC, not separate TCs. Do not split a TC across panels, endpoints, or UI sections.
3. **Equivalence Partitioning.** Same expected output = one parameterized ATC. Three ATCs all returning HTTP 401 for invalid login are wrong -- merge into one `loginWithInvalidCredentials(payload)`.
4. **ATCs do not call ATCs.** ATCs are atomic. For reusable chains, use the Steps module (`tests/components/steps/*Steps.ts`). Steps are NOT decorated with `@atc`.
5. **Locators inline.** No `locators/*.ts` files. Put the selector in the ATC. If the same locator is used in 2+ ATCs of the same component, extract it to a `private readonly` arrow function in the class -- not to a separate file.
6. **Helpers vs ATCs.** A read-only GET is a helper (no `@atc`, optionally `@step`). An action that changes state is an ATC (`@atc('TICKET-ID')`). A GET inside an ATC that verifies the action succeeded is fine -- but the GET alone is not an ATC.
7. **Fixed assertions go inside ATCs.** Status code, required fields, URL redirect checks. Test-level assertions (flow outcomes) go in the test file.
8. **Max 2 positional parameters.** 3+ parameters must use an object parameter (`fn(args: Args)`). Named object parameters beat positional lists for maintainability and autocomplete.
9. **Import aliases are mandatory.** `@api/`, `@ui/`, `@utils/`, `@variables`, `@TestContext`, `@schemas/`. No relative imports (`../../../`). Lint will reject them.
10. **No hardcoded waits.** Never `page.waitForTimeout(3000)`. Wait for a specific condition: `waitForSelector`, `waitForResponse`, `waitForLoadState('networkidle')`, or `data-loaded="true"` attributes.
11. **No retries by default.** `retries: 0` in `playwright.config.ts`. If a test passes on retry, it is flaky, not passing. Investigate.
12. **Credentials from `.env`, never hardcoded.** `LOCAL_USER_EMAIL` / `STAGING_USER_EMAIL` and their passwords. Read via `config.testUser` from `@variables`.
13. **Each test generates its own data.** No shared state between tests. Use `TestContext.generateUserData()` or faker helpers for unique values.
14. **Ticket ID prefix in every `test()`.** Format: `test('TICKET-ID: should {behavior} when {condition}', ...)`. The `describe` block may also include the ticket ID when the file is tied to a single ticket.
15. **One component per file, one file per feature.** Components follow `{Resource}Api.ts` or `{Page}Page.ts`. Test files follow `{verb}{Feature}.test.ts` (e.g., `applyDiscount.test.ts`, never `discount.test.ts`).

---

## Minimal templates (inline — small, load-bearing)

### KATA component signatures

```typescript
// API component — Layer 3
export class UsersApi extends ApiBase {
  constructor(options: TestContextOptions) { super(options); }

  // Helper (read-only)
  @step
  async getUserById(id: string): Promise<[APIResponse, UserResponse]> {
    return this.apiGET<UserResponse>(`/users/${id}`);
  }

  // ATC (state-changing)
  @atc('TICKET-ID')
  async createUserSuccessfully(payload: UserPayload): Promise<[APIResponse, UserResponse, UserPayload]> {
    const [response, body, sent] = await this.apiPOST<UserResponse, UserPayload>('/users', payload);
    expect(response.status()).toBe(201);
    expect(body.id).toBeDefined();
    return [response, body, sent];
  }
}
```

```typescript
// UI component — Layer 3
export class LoginPage extends UiBase {
  constructor(options: TestContextOptions) { super(options); }

  @atc('TICKET-ID')
  async loginWithValidCredentials(data: LoginData): Promise<void> {
    await this.page.goto('/login');
    await this.page.locator('#email').fill(data.email);
    await this.page.locator('#password').fill(data.password);
    await this.page.locator('button[type="submit"]').click();
    await expect(this.page).toHaveURL(/.*dashboard.*/);
  }
}
```

### Test file skeleton

```typescript
import { test, expect } from '@TestFixture';
import usersData from '@data/fixtures/users.json';

test.describe('TICKET-ID: Apply Discount Code', () => {
  test('TICKET-ID: should apply percentage discount when code is valid', async ({ api }) => {
    const order = await api.orders.createOrderSuccessfully(orderData);
    const totals = await api.orders.getTotals({ orderId: order.id });
    expect(totals.finalAmount).toBe(totals.baseAmount - totals.discountAmount);
  });
});
```

### Fixture registration (excerpt)

```typescript
// tests/components/UiFixture.ts
export class UiFixture extends TestContext {
  readonly login: LoginPage;
  readonly checkout: CheckoutPage;

  constructor(options: TestContextOptions) {
    super(options);
    this.login = new LoginPage(options);
    this.checkout = new CheckoutPage(options);
  }
}
```

---

## Quality gates (must pass before merge)

| Gate | Command | Must be |
|------|---------|---------|
| Tests pass | `bun run test {path}` | All green, zero retries used |
| Types | `bun run type-check` | No errors |
| Lint | `bun run lint` | No errors |
| Fixture registered | visual | Component is in `ApiFixture` / `UiFixture` / `StepsFixture` |
| ATC IDs linked | visual | Every `@atc('X')` matches a real TMS test case ID |
| Naming | visual | Files PascalCase for components, camelCase verb for test files |

---

## Which reference to read

Not every invocation needs every reference. Load the specific file when the task matches.

- **KATA architecture, fixture selection, ATC rules, Steps module mechanics** → `references/kata-architecture.md`
- **TypeScript conventions (params, imports, types, errors, DRY by layer)** → `references/typescript-patterns.md`
- **Naming, tagging, folder structure, anti-patterns, quality gates** → `references/automation-standards.md`
- **Writing a Playwright `Page` component, locator strategy, data-testid rules, UI waits** → `references/e2e-patterns.md`
- **Writing an `Api` component, OpenAPI type facades, HTTP helper usage, schema imports** → `references/api-patterns.md`
- **Designing test data (Discover → Modify → Generate), fixtures JSON, faker** → `references/test-data-management.md`
- **`@atc` / `@step` decorators, NDJSON results, TMS sync mechanics** → `references/atc-tracing.md`
- **Writing the Plan (module / ticket / ATC scopes and templates)** → `references/planning-playbook.md`
- **Running the review checklist (E2E or API)** → `references/review-checklists.md`
- **Configuring Playwright, CI integration, projects, sharding** → `references/ci-integration.md`

Tool resolution: use `[AUTOMATION_TOOL]` for browser work (Playwright CLI or MCP — load `/playwright-cli` when available), `[API_TOOL]` for OpenAPI exploration, `[DB_TOOL]` for verifying test data in the database, `[TMS_TOOL]` for TMS sync (load `/xray-cli` when available), `[ISSUE_TRACKER_TOOL]` for ticket lookups. Resolve tags via the project's CLAUDE.md Tool Resolution table.

---

## Quick reference

```bash
# Planning outputs
# .context/PBI/{module}/test-specs/{TICKET-ID}/spec.md
# .context/PBI/{module}/test-specs/{TICKET-ID}/implementation-plan.md
# .context/PBI/{module}/test-specs/{TICKET-ID}/atc/*.md

# Code locations
# tests/components/api/{Resource}Api.ts
# tests/components/ui/{Page}Page.ts
# tests/components/steps/{Domain}Steps.ts
# tests/integration/{module}/{verbFeature}.test.ts
# tests/e2e/{module}/{verbFeature}.test.ts

# Local validation loop
bun run test <path>
bun run type-check
bun run lint

# Env + TMS sync
cp .env.example .env                # populate test credentials
bun run api:sync                    # regenerate OpenAPI schema types
bun run kata:manifest               # extract ATC registry from code
```
