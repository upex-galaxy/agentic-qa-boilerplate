# KATA Invariants — Framework Evolution Reference

Canonical knowledge source for `framework-development`. Distinguishes what is INVARIANT (cannot break without major version bump) from what is EXTENSIBLE (safe evolution surface). Derived from the test-automation skill references and `docs/methodology/kata-fundamentals.md`. Use this file to gate framework changes: reject violations, approve safe extensions.

Terminology preserved verbatim: ATC, fixture, locator, Component, Steps, Helper, Page, Api, TestContext, ApiBase, UiBase, TestFixture.

---

## 1. The 4 layers (INVARIANT)

A higher layer may use a lower layer; never the inverse. Steps (3.5) is an optional intermediate layer between Domain (3) and Fixtures (4). Adding a new layer is FORBIDDEN — it breaks the inheritance chain assumed by every component.

| Layer | WHERE (file path) | WHAT (one-line responsibility) | WHY it cannot be collapsed |
|-------|-------------------|--------------------------------|----------------------------|
| 1 — TestContext | `tests/components/TestContext.ts` | Global config, faker, environment accessors, logger; agnostic to API/UI. | Shared baseline both ApiBase and UiBase extend. Collapsing into Base couples HTTP with browser. |
| 2 — ApiBase | `tests/components/api/ApiBase.ts` | HTTP helpers (`apiGET`, `apiPOST`, `apiPUT`, `apiPATCH`, `apiDELETE`) returning typed tuples; auth token state; Allure attach. | Owns `APIRequestContext`. Without it, every Api component re-implements HTTP. |
| 2 — UiBase | `tests/components/ui/UiBase.ts` | Playwright helpers (`interceptResponse`, `waitForApiResponse`, storage state, attachments). | Owns `Page`. Without it, every Page component re-implements Playwright wiring. |
| 3 — Domain (`{Resource}Api`, `{Page}Page`) | `tests/components/api/*Api.ts`, `tests/components/ui/*Page.ts` | Business logic surface. ATCs (`@atc('TICKET-ID')`) live here exclusively. | Maps 1:1 to TMS tickets. Collapsing into Base loses traceability and groups unrelated resources. |
| 3.5 — Steps (optional) | `tests/components/steps/*Steps.ts` | Reusable ATC chains used as preconditions across 3+ tests in 3+ files. NOT decorated with `@atc`. | Without Steps, callers either duplicate chains or violate Rule 5 (ATCs calling ATCs). |
| 4 — Fixtures | `tests/components/{ApiFixture,UiFixture,StepsFixture,TestFixture}.ts` | DI entry point. Instantiates and exposes every Domain component to test files. Lazy initialization (no browser unless requested). | Tests cannot reach a component unless it is registered here. Removing Fixtures breaks Playwright's `test.extend` integration. |

A test file is NOT a layer — it is a consumer of Layer 4.

---

## 2. Fixture selection (INVARIANT)

Fixture choice determines whether a browser opens. Wrong fixture = slow API tests or missing context. Selection rule cannot change without major version bump because it is part of every test file's import contract.

| Fixture | Use when | Browser? | Why it exists |
|---------|----------|----------|---------------|
| `{ api }` | API-only integration tests under `tests/integration/**`. | No (lazy). | Allows fast HTTP-only suites; avoids paying Playwright browser launch cost. |
| `{ ui }` | UI-only E2E tests with no API setup. | Yes. | Pure Playwright workflow; no `APIRequestContext` overhead. |
| `{ test }` | Hybrid: API setup + UI action + API verification. | Yes. | Shares the same `request` and `page` between Api and Ui components — required for token propagation across both surfaces. |
| `{ steps }` | Reusable precondition chains repeated across 3+ tests in 3+ files. | Depends on the steps used. | Eliminates ATC-to-ATC calls (Rule 5 violation) without forcing tests to repeat setup. |

Hard rule: never request `{ ui }` for an API-only test. Never request `{ api }` from an `tests/e2e/**` UI-only file. Hybrid tests MUST use `{ test }`, not destructure `{ api, ui }` from separate registrations (they would not share context).

---

## 3. ATC identity (INVARIANT)

An ATC = Acceptance Test Case = complete mini-flow mapped 1:1 to a TMS ticket via `@atc('TICKET-ID')`. The four ATC sub-rules are non-negotiable — a method violating any of them is not an ATC and must be reclassified or refactored.

- **Atomic mini-flow**: precondition → action → verification → assertions → return. NEVER a single `page.click()` or single `apiGET`. A read-only GET is a Helper (no `@atc`, optional `@step`), not an ATC.
- **NEVER calls another ATC**: ATCs are atomic. Reusable chains live in the Steps module (Layer 3.5). An ATC calling `this.someOtherAtc(...)` is a CRITICAL reject.
- **Max 2 positional params; 3+ → object param**: `fn(a, b, c, d)` is FORBIDDEN. Use `fn(args: Args)`. Applies to ATCs and to every Layer 2/3/3.5 method.
- **Locators inline; extract only if used 2+ times**: locators default inline inside the ATC. Extract to `private readonly someLocator = () => this.page.locator(...)` arrow function on the class only when used in 2+ ATCs of the same component. NEVER extract to a separate `locators/*.ts` file.

Additional ATC invariants from Rule 2 (TC Identity = Precondition + Action) and Rule 3 (Equivalence Partitioning): same precondition + same action = ONE TC regardless of how many fields it asserts; same expected output with different data = ONE parameterized ATC.

Naming pattern (INVARIANT): `{verb}{Resource}{Scenario}` camelCase. Suffixes: `Successfully` / `WithValidCredentials`, `WithInvalid{X}`, `WithNonExistent{X}`, `WithExpired{X}`, `WithRestricted{X}`. ATC class composition: max 15–20 ATCs per Domain component; split when larger.

---

## 4. DRY scope (INVARIANT)

Where each kind of code MUST live. Misplacement creates coupling and fragile tests. The placement rule is structural — moving HTTP helpers into `tests/utils/` (because "they are utilities") breaks the architecture.

| Code kind | MUST live in | MUST NOT live in |
|-----------|--------------|------------------|
| OpenAPI type facades (re-exports of `components`/`paths`) | `api/schemas/{domain}.types.ts` | Domain components (only facades may import `@openapi`) |
| Agnostic utilities (no Playwright, no HTTP) — Allure attach helpers, string formatters, validators | `tests/utils/` | UiBase, ApiBase, Domain components |
| ALL Playwright helpers (anything needing `Page` / `PageContext`) — `interceptResponse`, `waitForApiResponse`, storage-state snapshots | `UiBase` (`tests/components/ui/UiBase.ts`) | `tests/utils/`, TestContext, Domain components |
| ALL HTTP helpers (anything needing `APIRequestContext`) — `apiGET/POST/PUT/PATCH/DELETE`, auth token state | `ApiBase` (`tests/components/api/ApiBase.ts`) | `tests/utils/`, TestContext, Domain components |
| Cross-both shared (faker, config accessors, environment selection) | `TestContext` (`tests/components/TestContext.ts`) | UiBase, ApiBase (anything Playwright/HTTP-specific) |
| Domain-specific logic for one resource/page | Layer 3 component (e.g. `generateOrderPayload()` inside `OrdersApi`) | Base classes, utilities |
| Reusable ATC chains for preconditions (3+ ATCs across 3+ files) | `tests/components/steps/{Domain}Steps.ts` | ATC body (would violate Rule 5) |
| Test data generators (faker-backed, typed) | `tests/data/DataFactory.ts` (+ types in `tests/data/types.ts`) | Direct `faker` import in components or tests |
| Reference fixture data (roles, mock responses, parameterised inputs) | `tests/data/fixtures/*.json` (committed) | Hardcoded literals in tests |

If you are tempted to put an API helper in `tests/utils/`, stop — it depends on `APIRequestContext`, so it belongs in `ApiBase`.

---

## 5. Import aliases (INVARIANT)

Aliases are mandatory. Lint rejects relative imports across layers via `eslint-plugin-import`. Disabling the rule is FORBIDDEN.

Required `tsconfig.json` `paths`:

```
"@config/*"     -> ./config/*
"@variables"    -> ./config/variables.ts
"@components/*" -> ./tests/components/*
"@api/*"        -> ./tests/components/api/*
"@ui/*"         -> ./tests/components/ui/*
"@steps/*"      -> ./tests/components/steps/*
"@utils/*"      -> ./tests/utils/*
"@schemas/*"    -> ./api/schemas/*
"@TestContext"  -> ./tests/components/TestContext.ts
"@TestFixture"  -> ./tests/components/TestFixture.ts
"@ApiFixture"   -> ./tests/components/ApiFixture.ts
"@UiFixture"    -> ./tests/components/UiFixture.ts
"@StepsFixture" -> ./tests/components/StepsFixture.ts
"@data/*"       -> ./tests/data/*
"@openapi"      -> ./api/openapi-types.ts (FACADE-ONLY consumer)
```

Rule: Domain components import from `@schemas/{domain}.types`, NEVER from `@openapi`. Only files under `api/schemas/` may import `@openapi`. Test files import `test` from `@TestFixture`, NOT from `@playwright/test`.

Renaming an alias is a major-version-bump-level change because every test file and component imports through it.

---

## 6. Public method contract (INVARIANT)

KATA distinguishes the public API surface (ATCs and class-public helpers) from internal utilities. Error-handling discipline differs by surface and is part of the test contract.

- **Public methods (ATCs, class-public helpers): fail fast — `throw new Error(...)` with descriptive message**. Test must fail loudly at the call site. Example: `apiGET<T>(...)` throws if `this.request` is unset.
- **Private utilities (parsers, matchers, internal helpers): silent fail — `return null` / `return undefined`**. Caller decides. Example: `parseResponseBody<T>` returns `null` when the response is not JSON.
- **Why**: public methods are part of the test contract that downstream tests rely on; failing silently masks real bugs. Utilities are convenience — `null` lets the caller handle the missing-data case explicitly.

Additional public-surface invariants:

- Never swallow an error inside an ATC without re-throwing.
- Sensitive parameter names must stay canonical (`password`, `token`, `secret`, `authorization`, `access_token`) so `@atc` / `@step` decorators auto-mask in trace output. Renaming these keys silently leaks credentials to Allure / NDJSON.
- Tuple-return contract per HTTP method is INVARIANT: `apiGET/DELETE` → `[APIResponse, T]`; `apiPOST/PUT/PATCH` → `[APIResponse, T, P]`. Changing tuple shape breaks every Domain ATC.

---

## 7. Extension points (EXTENSIBLE — explicit allowlist)

Where new code CAN safely land WITHOUT a major-version bump. Anything not on this list requires architectural review.

| Extension | Where | Constraint |
|-----------|-------|------------|
| New agnostic utility | `tests/utils/<name>.ts` | MUST NOT depend on Playwright `Page` or `APIRequestContext`. If it does, it belongs in `UiBase` or `ApiBase`. |
| New helper method on `ApiBase` | `tests/components/api/ApiBase.ts` | MUST be reusable across multiple `*Api` subclasses. Domain-specific logic stays in the Domain component. |
| New helper method on `UiBase` | `tests/components/ui/UiBase.ts` | Same constraint — must be reusable across multiple `*Page` subclasses. |
| New Domain component | `tests/components/api/{Resource}Api.ts` or `tests/components/ui/{Page}Page.ts` | MUST be registered in the matching Fixture (`ApiFixture`, `UiFixture`). Without registration, tests cannot reach it. ApiFixture must also forward `setRequestContext`/`setAuthToken`/`clearAuthToken`. |
| New Steps module | `tests/components/steps/{Domain}Steps.ts` | Must be registered in `StepsFixture`. NOT decorated with `@atc`. Used only when 3+ ATCs repeat across 3+ files. |
| New Fixture registration entry | `ApiFixture` / `UiFixture` / `StepsFixture` constructor | Must mirror auth propagation pattern (forward `setRequestContext` / `setAuthToken` / `clearAuthToken` from ApiFixture override). |
| New OpenAPI facade | `api/schemas/{domain}.types.ts` | Must be re-exported from `api/schemas/index.ts` barrel. Only facade files import `@openapi`. |
| New DataFactory generator | `tests/data/DataFactory.ts` (+ matching interface in `tests/data/types.ts`) | Use `faker` only inside DataFactory. Tests/components must NEVER import `faker` directly. |
| New static fixture data | `tests/data/fixtures/*.json` | Only for reference data (roles, permission matrices, mock responses, configuration trees). Transactional data goes to DataFactory. |
| New script | `scripts/<name>.ts` | Add the matching `bun run` entry to `package.json`. |
| New CLI command | `cli/<command>/` | Project-level installer concern; standalone binaries do not affect the runtime test architecture. |
| New TS path alias | `tsconfig.json` `paths` | Allowed for new layers/folders — but never collapses an existing alias. |
| New Playwright tag | usage in `test()`/`describe()` | Must be documented in `automation-standards.md` §4 tag table. |

---

## 8. Evolution patterns (CHECKLIST — "if you change X, verify Y")

Mandatory verification matrix when modifying load-bearing surface area. Each row gates a CRITICAL change.

| If you change... | You must verify... |
|------------------|-------------------|
| `ApiBase.apiGET/POST/PUT/PATCH/DELETE` signature or tuple return | Re-run ALL Api ATC tests; type-check entire repo; grep every `*Api.ts` for tuple destructure shape. |
| `ApiBase` auth methods (`setAuthToken`, `clearAuthToken`, `setRequestContext`) | Verify `ApiFixture` overrides forward to every registered Api component. Run all 401-coverage tests. |
| `UiBase.interceptResponse` / `waitForApiResponse` signature | Re-run ALL UI ATCs that use interception; confirm Allure attachments still produce. |
| `TestContext` constructor or option shape (`TestContextOptions`) | Audit every Layer 2/3/3.5 constructor that calls `super(options)`. Re-run full suite. |
| Fixture signature in `TestFixture`/`ApiFixture`/`UiFixture`/`StepsFixture` | Grep all consumers (`tests/**/*.test.ts`); update destructures; re-run full suite. |
| Import alias in `tsconfig.json` paths | Update tsconfig + every import in repo + ESLint config. Run `bun run types:check` + `bun run lint:check`. |
| `@atc` / `@step` decorator API or `SENSITIVE_KEYS` set | Re-run full suite; manually inspect Allure step titles for unmasked sensitive values; verify NDJSON line schema unchanged. |
| `KataReporter` NDJSON line schema or `atc_results.json` aggregation logic | Verify teardown summary still parses; verify TMS sync (`syncToXray`, `syncToJiraDirect`) still consumes correct fields. |
| `tests/utils/decorators.ts` `storeResult` writer | Confirm NDJSON file is still atomic-append safe; confirm reporter `onEnd` deletes the partial file. |
| `kata:manifest` extraction regex (`@atc\s*\(\s*['"]([^'"]+)['"]`) | Verify it still matches every existing `@atc('...')` call. Computed/template-literal IDs remain unsupported by design. |
| OpenAPI facade pattern (replace `paths`/`components` indexing) | Regenerate types via `bun run api:sync`; re-run `bun run types:check`. |
| Adding a new layer between existing layers | FORBIDDEN — breaks the 4-layer model invariant. Reject. |
| Replacing the Playwright dependency | Major-version bump; UiBase entire surface invalidated. Reject without version-bump approval. |

---

## 9. What `framework-development` CANNOT touch

Out-of-scope surfaces. Modifying these from a framework-development task is FORBIDDEN — they belong to other workflows or are auto-regenerated.

- **Generated artifacts**: `api/openapi-types.ts` is generated by `bun run api:sync` from `api/openapi.json`. Never hand-edit. `api/openapi.json` and `api/.openapi-config.json` are gitignored local cache. `kata-manifest.json` is generated by `bun run kata:manifest`. `reports/atc_results.json` and `reports/.atc_partial.ndjson` are runtime artifacts.
- **Per-ticket test specs** (consumers, not framework): `tests/e2e/**/*.test.ts`, `tests/integration/**/*.test.ts`, and ticket-specific subclasses under `tests/components/{module}/` (the BASE classes `ApiBase`/`UiBase`/`TestContext` are framework; concrete `*Api`/`*Page` for a ticket are consumer code owned by `test-automation`).
- **Per-ticket QA context**: `.context/PBI/**` (PBI folders, ATPs, ATRs, evidence). Owned by `sprint-testing` / `test-documentation`.
- **Project-wide context**: `.context/business/**`, `.context/master-test-plan.md`. Owned by `/business-*-map`, `/master-test-plan`. (TMS modality + Regression Epic are resolved live by `/test-documentation` from `.agents/project.yaml` and Jira itself — no `.context/` file.)
- **Credentials and env**: `.env`, `.env.example` (only the variable list may be appended when adding a new framework env var; never values).
- **Playwright artifacts (gitignored)**: `test-results/`, `tests/data/downloads/`, `playwright/.auth/`.
- **Test results / TMS sync state**: outputs of CI runs, not framework code.
- **Skills / Commands / CLAUDE.md**: owned by `/agentic-qa-core`, `/sync-ai-memory`, and the SDD orchestrator. A framework change that needs to surface in AI memory must coordinate via `/sync-ai-memory`, not direct edit.

---

## 10. ALLOWED and FORBIDDEN paths (POLICY)

Two complementary tables that gate every `framework-development` change. The ALLOWED table enumerates the surface this skill owns; the FORBIDDEN table redirects to the owning workflow skill. Phase 0 of `framework-development/SKILL.md` cites this section by name — keep tables flat and grep-friendly.

These are POLICY tables, not INVARIANT rules. They can be amended additively without a major-version bump (e.g. when a new layer or fixture type is introduced), but only via a `/framework-development` change that touches this file itself.

### 10.1 ALLOWED paths (framework surface)

| Path                                                  | Why it lives here                                                                                                |
|-------------------------------------------------------|------------------------------------------------------------------------------------------------------------------|
| `cli/`                                                | Installer + agents:setup + vars:check — project-level tooling, ships with every clone                            |
| `scripts/`                                            | `bun run` script implementations (`api:sync`, `kata:manifest`, `jira:sync-fields`, `lint:skills`, etc.)          |
| `.agents/` (structure changes only)                   | Schema for `project.yaml`, `jira-fields.json`, `jira-workflows.json`, `jira-required.yaml`. Values stay manual.  |
| `tests/utils/`                                        | Agnostic utilities — Allure attach helpers, decorators, formatters. Evolution of the utility layer.              |
| `tests/components/` (Layer 2 + 3 base classes only)   | `TestContext.ts`, `ApiBase.ts`, `UiBase.ts`. NOT per-module `*Api.ts` / `*Page.ts` (those are test-automation).  |
| `tests/components/` (fixture files)                   | Fixture registry evolution — `ApiFixture.ts`, `UiFixture.ts`, `TestFixture.ts`. New fixture APIs.                |
| `scripts/sync-openapi.ts` and the sync pipeline       | Pipeline source. NOT generated `api/openapi-types.ts` (that is regenerated by `bun run api:sync`).               |
| `package.json` deps + scripts                         | Dependency upgrades, script registry, engines. Not test specs in `tests/`.                                       |
| `.claude/skills/agentic-qa-core/references/`          | Briefing template, dispatch patterns, orchestration doctrine, skill-composition-strategy.                        |
| `.claude/skills/framework-development/`               | This skill itself — references, scripts, agents/.                                                                |
| `.claude/commands/`                                   | Slash-command source (`/sync-ai-memory`, `/business-*-map`, `/master-test-plan`, etc.).                          |

### 10.2 FORBIDDEN paths (redirect map)

| Path                                                | Owned by                                                                                       |
|-----------------------------------------------------|------------------------------------------------------------------------------------------------|
| `tests/e2e/`                                        | `/test-automation` — per-ticket E2E specs                                                       |
| `tests/integration/`                                | `/test-automation` — per-ticket API/integration specs                                           |
| `tests/components/{module}/` (Page/Api/Steps)       | `/test-automation` — module-specific Domain components and Steps                                |
| `.context/PBI/`                                     | `/sprint-testing` — per-ticket QA context                                                       |
| `.context/master-test-plan.md`                      | `/master-test-plan` command — regenerative                                                      |
| `.context/business/`                                | `/business-data-map`, `/business-feature-map`, `/business-api-map` commands — regenerative      |
| `api/openapi-types.ts`                              | Generated artifact — regenerated by `bun run api:sync`                                          |
| `kata-manifest.json`, `reports/atc_results.json`    | Generated artifacts — runtime / build outputs                                                   |
| `.env`, credentials                                 | Manual edit only — no skill, no AI rewrite                                                      |

### 10.3 Tie-break rules

- A path matches neither table → ASK the user explicitly. Never assume.
- A single change spans both tables → SPLIT-WORK: framework-development owns the framework slice; the FORBIDDEN-row owner owns the consumer slice in a follow-up.
- Hot-spot exceptions: changes to `tests/components/{module}/` that ONLY rename or move existing files as part of a base-class evolution are still owned by `/test-automation` — coordinate via the SPLIT-WORK rule rather than reaching for the file from this skill.

---

*Reference compiled from `kata-architecture.md`, `typescript-patterns.md`, `api-patterns.md`, `e2e-patterns.md`, `atc-tracing.md`, `automation-standards.md`, `data-testid-strategy.md`, `test-data-management.md`, `review-checklists.md`, `test-automation/SKILL.md`, and `docs/methodology/kata-fundamentals.md`. Update only when a source doc changes a load-bearing rule.*
