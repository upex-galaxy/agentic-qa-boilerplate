# KATA invariants: framework evolution reference

This is the knowledge source `framework-development` checks a framework change against. It separates what is invariant (it cannot break without a major version bump) from what is extensible (the safe evolution surface), so you can reject a violation and approve a safe extension quickly. It is derived from the `test-automation` references, chiefly `test-automation/references/kata-architecture.md`.

Terminology is kept verbatim: ATC, fixture, locator, Component, Steps, Helper, Page, Api, TestContext, ApiBase, UiBase, TestFixture.

> **Canonical formula — the one sentence every KATA surface must agree with:**
>
> **KATA organises automation in four layers with a single direction of dependency: TestContext,
> Base, domain Components and Fixtures. Steps is an optional intermediate layer between Components
> and Fixtures. Test files consume the Fixtures — they are not a layer.**
>
> Short form: **"four named layers, plus optional Steps"**. Never publish a bare number. Banned on
> every surface: "three layers", "five layers", "6 layers", "Test files" as a layer, and
> the acronym expanded with a C ("Component Action Test Architecture"). The expansion is
> **Komponent Action Test Architecture**: the K lives only in the name; the layer is "domain
> Components", spelled normally. DRY zones that are NOT layers: `tests/utils/`, `tests/data/`, `config/`.
> Consumers: `tests/e2e/`, `tests/integration/`. Mirrored verbatim in
> `test-automation/references/kata-architecture.md`; if the two ever differ, that is the drift.

---

## 1. The 4 layers (INVARIANT)

A higher layer may use a lower layer, and never the reverse. Steps (3.5) is an optional intermediate layer between Domain (3) and Fixtures (4). Adding a new layer is forbidden because it breaks the inheritance chain every component assumes.

| Layer | WHERE (file path) | WHAT (one-line responsibility) | WHY it cannot be collapsed |
|-------|-------------------|--------------------------------|----------------------------|
| 1: TestContext | `tests/components/TestContext.ts` | Playwright drivers, config, environment, DataFactory; agnostic to API/UI. | Shared baseline both ApiBase and UiBase extend. Collapsing into Base couples HTTP with browser. |
| 2: ApiBase | `tests/components/api/ApiBase.ts` | HTTP helpers (`apiGET`, `apiPOST`, `apiPUT`, `apiPATCH`, `apiDELETE`) returning typed tuples; auth token state; Allure attach. | Owns `APIRequestContext`. Without it, every Api component re-implements HTTP. |
| 2: UiBase | `tests/components/ui/UiBase.ts` | Playwright helpers (`interceptResponse`, `waitForApiResponse`, storage state, attachments). | Owns `Page`. Without it, every Page component re-implements Playwright wiring. |
| 3: Domain (`{Resource}Api`, `{Page}Page`) | `tests/components/api/*Api.ts`, `tests/components/ui/*Page.ts` | Business logic surface. ATCs (`@atc('TICKET-ID')`) live here exclusively. | Maps 1:1 to TMS tickets. Collapsing into Base loses traceability and groups unrelated resources. |
| 3.5: Steps (optional) | `tests/components/steps/*Steps.ts` | Reusable ATC chains used as preconditions across 3+ tests in 3+ files. Not decorated with `@atc`. | Without Steps, callers either duplicate chains or violate Rule 5 (ATCs calling ATCs). |
| 4: Fixtures | `tests/components/{ApiFixture,UiFixture,TestFixture}.ts` | DI entry point. Instantiates and exposes every Domain component to test files. Lazy initialization (no browser unless requested). Steps modules are not fixture-registered: tests instantiate them directly (`new {Domain}Steps(options)`). | Tests cannot reach a component unless it is registered here. Removing Fixtures breaks Playwright's `test.extend` integration. |

A test file is not a layer. It is a consumer of Layer 4.

**Enforced by:** `kata/layer-imports` (a domain component imports no other component, Layers 1 to 3 import no Fixtures or Steps, `TestContext.ts` imports no `@api/*`, `@ui/*` or `@steps/*`), `kata/no-decorator-in-base` (no `@atc` or `@step` in the Bases or `TestContext`), `kata-manifest.ts --check` (every Domain component is fixture-registered). Review owns whether a responsibility sits in the right layer.

---

## 2. Fixture selection (INVARIANT)

The fixture decides whether a browser opens, so a wrong choice gives slow API tests or a missing context. The rule is part of every test file's import contract, which is why it cannot change without a major version bump.

| Fixture | Use when | Browser? | Why it exists |
|---------|----------|----------|---------------|
| `{ api }` | API-only integration tests under `tests/integration/**`. | No (lazy). | Fast HTTP-only suites that skip the Playwright browser launch cost. |
| `{ ui }` | UI-only E2E tests with no API setup. | Yes. | Pure Playwright workflow, no `APIRequestContext` overhead. |
| `{ test }` | Hybrid: API setup, UI action, API verification. | Yes. | Shares the same `request` and `page` between Api and Ui components, which token propagation across both surfaces requires. |

There is no `{ steps }` fixture. Steps modules (reusable precondition chains repeated across 3+ tests in 3+ files) live in `tests/components/steps/`, extend `TestContext`, and are instantiated directly in the test (`const steps = new {Domain}Steps({ request })`). They remove ATC-to-ATC calls (a Rule 5 violation) without making tests repeat setup, and they never enter the fixture DI surface.

**Enforced by:** `kata/no-raw-page-in-spec` (a spec never destructures `page` or `request`), `kata/layer-imports` (`test` comes from `@TestFixture`). Review owns the choice between `{ api }`, `{ ui }` and `{ test }`.

Hard rules: an API-only test does not request `{ ui }`, and a UI-only file under `tests/e2e/**` does not request `{ api }`. A hybrid test uses `{ test }` and does not destructure `{ api, ui }` from separate registrations, because those would not share context.

---

## 3. ATC identity (INVARIANT)

An ATC (Acceptance Test Case) is a complete mini-flow mapped 1:1 to a TMS ticket through `@atc('TICKET-ID')`. The four sub-rules below are not negotiable. A method that breaks one is not an ATC and has to be reclassified or refactored.

- **Atomic mini-flow**: precondition, action, verification, assertions, return. A bare `page.click()` or a bare `apiGET` with no outcome assertion is not an ATC. A GET that only prepares data is a Helper (no `@atc`, optional `@step`); a GET whose response is the business outcome under test is an ATC (`test-automation/references/kata-architecture.md` Rule 7).
- **No ATC calls another ATC.** Enforced by `kata/atc-no-atc-call`. ATCs are atomic, and reusable chains live in the Steps module (Layer 3.5). An ATC calling `this.someOtherAtc(...)` is a critical reject.
- **At most 2 positional params; with 3 or more, use an object param.** `fn(a, b, c, d)` is forbidden; write `fn(args: Args)`. This holds for ATCs and for every Layer 2, 3 and 3.5 method, except the protected HTTP primitives of `ApiBase` (`apiGET`, `apiPOST`, `apiPUT`, `apiPATCH`, `apiDELETE`), which take path, payload and options by contract (owner sweep 2026-11-17). Enforced by core `max-params` on `tests/components/{api,ui,steps}/**` with an override that turns it off for `ApiBase.ts`.
- **Locators stay inline, and are extracted only when used twice or more.** A locator defaults to inline inside the ATC. Extract it to a `private readonly someLocator = () => this.page.locator(...)` arrow function on the class only when 2+ ATCs of the same component use it. It never goes to a separate `locators/*.ts` file.

**Enforced by:** the atomic mini-flow and the locator-extraction rule are review. `playwright/no-nth-methods` and `playwright/no-force-option` cover the locator shapes that break on refactor, `playwright/no-wait-for-timeout`, `no-wait-for-selector` and `no-networkidle` cover waits, and `max-lines` on domain components covers the size cap.

Two more ATC invariants come from Rule 2 (TC identity is precondition plus action) and Rule 3 (equivalence partitioning). The same precondition and the same action make ONE TC however many fields it asserts, and the same expected output with different data makes ONE parameterized ATC.

Naming pattern (INVARIANT): `{verb}{Resource}{Scenario}` in camelCase. Suffixes are `Successfully` / `WithValidCredentials`, `WithInvalid{X}`, `WithNonExistent{X}`, `WithExpired{X}` and `WithRestricted{X}`. A Domain component holds at most 15 to 20 ATCs and splits when larger.

---

## 4. DRY scope (INVARIANT)

Each kind of code has one home. Misplacing it creates coupling and fragile tests, and the placement rule is structural: moving HTTP helpers into `tests/utils/` because "they are utilities" breaks the architecture.

| Code kind | Lives in | Does not live in |
|-----------|----------|------------------|
| OpenAPI type facades (re-exports of `components`/`paths`) | `api/schemas/{domain}.types.ts` | Domain components (only facades may import `@openapi`) |
| Agnostic utilities (no Playwright, no HTTP): Allure attach helpers, string formatters, validators | `tests/utils/` | UiBase, ApiBase, Domain components |
| All Playwright helpers (anything needing `Page` / `PageContext`): `interceptResponse`, `waitForApiResponse`, storage-state snapshots | `UiBase` (`tests/components/ui/UiBase.ts`) | `tests/utils/`, TestContext, Domain components |
| All HTTP helpers (anything needing `APIRequestContext`): `apiGET/POST/PUT/PATCH/DELETE`, auth token state | `ApiBase` (`tests/components/api/ApiBase.ts`) | `tests/utils/`, TestContext, Domain components |
| Cross-both shared (faker, config accessors, environment selection) | `TestContext` (`tests/components/TestContext.ts`) | UiBase, ApiBase (anything Playwright/HTTP-specific) |
| Domain-specific logic for one resource/page | Layer 3 component (e.g. `generateOrderPayload()` inside `OrdersApi`) | Base classes, utilities |
| Reusable ATC chains for preconditions (3+ ATCs across 3+ files) | `tests/components/steps/{Domain}Steps.ts` | ATC body (would violate Rule 5) |
| Test data generators (faker-backed, typed) | `tests/data/DataFactory.ts` (+ types in `tests/data/types.ts`) | Direct `faker` import in components or tests |
| Reference fixture data (roles, mock responses, parameterised inputs) | `tests/data/fixtures/*.json` (committed) | Hardcoded literals in tests |

If an API helper looks like it belongs in `tests/utils/`, it depends on `APIRequestContext`, so it belongs in `ApiBase`.

**Enforced by:** `kata/layer-imports` for the two import homes (`@faker-js/faker` only in `tests/data/DataFactory.ts`, `@openapi` only under `api/schemas/`). Review owns every other row of the table.

---

## 5. Import aliases (INVARIANT)

Aliases are mandatory across `tests/**`, and a lint rule enforces them, so this is more than doctrine. The alias set is declared in `tsconfig.base.json`. `KATA_IMPORT_ALIASES` in `eslint.config.base.js` is a core `no-restricted-imports` block scoped to `tests/**/*.ts` and `playwright.config.ts` that rejects every `./` and `../` import there. It is a second block beside `CLI_IMPORT_CLOSURE` (which stays scoped to `cli/**` and guards the updater's import closure), and the two file sets are disjoint.

Three facts to know before citing the rule:

- It is core ESLint (`no-restricted-imports`), not `eslint-plugin-import`. Do not attribute it to a plugin nobody installed.
- A dynamic `await import('./x')` is not caught. The rule matches static import and export declarations only.
- `eslint.config.js` is project-owned and the sync never overwrites it, so a downstream project receives the exported block and not the wiring. `validateEslintBlockWiring` (`cli/lib/agent-compatibility-contracts.ts`) fails `agents:compat:check` when a block the base exports is absent from the consumer, which is what stops the rule from shipping inert.

**Enforced by:** `KATA_IMPORT_ALIASES` for the relative-import ban, `kata/layer-imports` for the `@TestFixture`, `@faker-js/faker` and `@openapi` rules.

The KATA blocks the base exports are `KATA_IMPORT_ALIASES`, `KATA_RULES` (the `kata` plugin), `KATA_SHAPE` (`max-params`, `max-lines`) and `KATA_PLAYWRIGHT` (the `eslint-plugin-playwright` set). `KATA_ENFORCEMENT_LEVEL` in `eslint.config.base.js` sets the severity of every block except `KATA_IMPORT_ALIASES`: `'error'`. A project that needs time to clean its violations lowers a rule in its own `eslint.config.js` and `.oxlintrc.json`. `scripts/kata-manifest.ts` mirrors the constant for its fixture-registration check, and the two values move together.

Review (`/pr-review-lead`) owns the half a lint rule cannot judge: whether the alias chosen is the right one for the layer.

The alias set is whatever `tsconfig.base.json` `paths` declares. That file is the authority, so read it and do not trust a copy; `tsconfig.json` extends the base and declares no `paths` of its own. `@openapi` is a facade-only consumer.

There is no `@config/*` and no `@components/*`. Config is reached through `@variables`, and the component tree through the per-layer aliases (`@ui/*`, `@api/*`, `@steps/*`) or the named fixture and context entries. A framework change that assumes either will not resolve.

Domain components import from `@schemas/{domain}.types` and never from `@openapi`; only files under `api/schemas/` may import `@openapi`. Test files import `test` from `@TestFixture`, not from `@playwright/test`.

Renaming an alias is a major-version-bump change, because every test file and component imports through it.

---

## 6. Public method contract (INVARIANT)

KATA treats the public API surface (ATCs and class-public helpers) differently from internal utilities, and the difference in error handling is part of the test contract.

- **Methods a test can reach (ATCs, class-public `@step` helpers) fail fast** with `throw new Error(...)` and a descriptive message, so the test fails loudly at the call site. The `apiXXX` HTTP primitives are `protected` and not part of that surface: `ApiBase` fails fast from its `get request()` getter when no context is available.
- **Private utilities (parsers, matchers, internal helpers) fail silently** with `return null` or `return undefined`, and the caller decides. Example: `parseResponseBody<T>` returns `null` when the response is not JSON.
- **Why**: public methods are the contract downstream tests rely on, and failing silently there masks real bugs. Utilities are a convenience, and `null` lets the caller handle missing data explicitly.

More public-surface invariants:

- An error inside an ATC is always re-thrown, never swallowed.
- Sensitive parameter names stay canonical (`password`, `token`, `secret`, `authorization`, `access_token`) so the `@atc` and `@step` decorators auto-mask them in trace output. Renaming these keys silently leaks credentials to Allure and NDJSON.
- The tuple return per HTTP method is fixed: `apiGET/DELETE` return `[APIResponse, T]` and `apiPOST/PUT/PATCH` return `[APIResponse, T, P]`. Changing the tuple shape breaks every Domain ATC.

**Enforced by:** the type checker for the tuple shape, `playwright/no-conditional-expect` for assertions hidden in branches, and review for the fail-fast and silent-utility split, the re-throw and the sensitive key names.

---

## 7. Extension points (EXTENSIBLE, explicit allowlist)

These are the places new code can land without a major-version bump. Anything not listed needs architectural review.

| Extension | Where | Constraint |
|-----------|-------|------------|
| New agnostic utility | `tests/utils/<name>.ts` | Must not depend on Playwright `Page` or `APIRequestContext`. If it does, it belongs in `UiBase` or `ApiBase`. |
| New helper method on `ApiBase` | `tests/components/api/ApiBase.ts` | Must be reusable across multiple `*Api` subclasses. Domain-specific logic stays in the Domain component. |
| New helper method on `UiBase` | `tests/components/ui/UiBase.ts` | Same constraint: reusable across multiple `*Page` subclasses. |
| New Domain component | `tests/components/api/{Resource}Api.ts` or `tests/components/ui/{Page}Page.ts` | Must be registered in the matching Fixture (`ApiFixture`, `UiFixture`), or tests cannot reach it. ApiFixture also forwards `setAuthToken` and `clearAuthToken` to it (there is no `setRequestContext`: the request context arrives through the constructor). |
| New Steps module | `tests/components/steps/{Domain}Steps.ts` | Extends `TestContext`, is instantiated directly in tests (`new {Domain}Steps(options)`), is never fixture-registered and is not decorated with `@atc`. Used only when 3+ ATCs repeat across 3+ files. Anti-duplication check: `kata-manifest.json` `steps[]` lists every existing Steps module, so consult it before proposing a new one. |
| New Fixture registration entry | `ApiFixture` / `UiFixture` constructor | Mirrors the auth propagation pattern (forward `setAuthToken` and `clearAuthToken` from the ApiFixture overrides; the request context is constructor-injected, not forwarded). |
| New OpenAPI facade | `api/schemas/{domain}.types.ts` | Re-exported from the `api/schemas/index.ts` barrel. Only facade files import `@openapi`. |
| New DataFactory generator | `tests/data/DataFactory.ts` (+ matching interface in `tests/data/types.ts`) | `faker` is used only inside DataFactory. Tests and components never import `faker` directly. |
| New static fixture data | `tests/data/fixtures/*.json` | Reference data only (roles, permission matrices, mock responses, configuration trees). Transactional data goes to DataFactory. |
| New script | `scripts/<name>.ts` | Add the matching `bun run` entry to `package.json`. |
| New CLI command | `cli/<command>/` | A project-level installer concern; standalone binaries do not affect the runtime test architecture. |
| New TS path alias | `tsconfig.base.json` `paths` (the alias authority, §5) | Allowed for new layers and folders, and never collapses an existing alias. |
| New Playwright tag | usage in `test()`/`describe()` | Documented in the `automation-standards.md` §4 tag table. |

---

## 8. Evolution patterns (checklist: if you change X, verify Y)

Each row gates a critical change to load-bearing surface.

| If you change... | You must verify... |
|------------------|-------------------|
| `ApiBase.apiGET/POST/PUT/PATCH/DELETE` signature or tuple return | Re-run all Api ATC tests; type-check the whole repo; grep every `*Api.ts` for the tuple destructure shape. |
| `ApiBase` auth methods (`setAuthToken`, `clearAuthToken`) | `ApiFixture` overrides forward to every registered Api component. Run all 401-coverage tests. |
| `UiBase.interceptResponse` / `waitForApiResponse` signature | Re-run all UI ATCs that use interception; confirm Allure attachments still produce. |
| `TestContext` constructor or option shape (`TestContextOptions`) | Audit every Layer 2, 3 and 3.5 constructor that calls `super(options)`. Re-run the full suite. |
| Fixture signature in `TestFixture`/`ApiFixture`/`UiFixture` | Grep all consumers (`tests/**/*.test.ts`), update the destructures, re-run the full suite. |
| Import alias in `tsconfig.base.json` paths | Update `tsconfig.base.json`, every import in the repo and the ESLint config. Run `bun run types:check` and `bun run lint:check`. |
| `@atc` / `@step` decorator API or `SENSITIVE_KEYS` set | Re-run the full suite; inspect Allure step titles by hand for unmasked sensitive values; verify the NDJSON line schema is unchanged. |
| `KataReporter` NDJSON line schema or `atc_results.json` aggregation logic | The teardown summary still parses, and TMS sync (`syncToXray`, `syncToJiraDirect`) still consumes the right fields. |
| `tests/utils/decorators.ts` `storeResult` writer | The NDJSON file is still safe for atomic append, and the reporter `onEnd` deletes the partial file. |
| `kata:manifest` extraction regex (`@atc\s*\(\s*['"]([^'"]+)['"]`) | It still matches every existing `@atc('...')` call. Computed or template-literal IDs stay unsupported by design. |
| `KATA_ENFORCEMENT_LEVEL` (`eslint.config.base.js` and `scripts/kata-manifest.ts`) and the severities in `.oxlintrc.base.json` | Move all three together; in the boilerplate, its Oxlint config test fails when the Oxlint file disagrees with the constant. Run `bun run lint:check` and `bun run kata:manifest:check` on a representative suite first, and read every new finding before the change lands. |
| OpenAPI facade pattern (replace `paths`/`components` indexing) | Regenerate types with `bun run api:sync`; re-run `bun run types:check`. |
| Adding a new layer between existing layers | Forbidden: it breaks the 4-layer model invariant. Reject. |
| Replacing the Playwright dependency | A major-version bump that invalidates UiBase's entire surface. Reject without version-bump approval. |

---

## 9. What `framework-development` cannot touch

These surfaces belong to other workflows or are regenerated automatically, so a framework-development task leaves them alone.

- **Generated artifacts**: `api/openapi-types.ts` is generated by `bun run api:sync` from `api/openapi.json` and is never hand-edited. `api/openapi.json` and `api/.openapi-config.json` are a gitignored local cache. `kata-manifest.json` is generated by `bun run kata:manifest`. `reports/atc_results.json`, `reports/test-outcomes.json` and `reports/.atc_partial.ndjson` are runtime artifacts.
- **Per-ticket test specs** (consumers, not framework): `tests/e2e/**/*.test.ts`, `tests/integration/**/*.test.ts`, and ticket-specific subclasses under `tests/components/{module}/`. The base classes `ApiBase`, `UiBase` and `TestContext` are framework; the concrete `*Api` and `*Page` for a ticket are consumer code owned by `test-automation`.
- **Per-ticket QA context**: `.context/PBI/**` (PBI folders, ATPs, ATRs, evidence), owned by `sprint-testing` and `test-documentation`.
- **Project-wide context**: the context maps inside the context map skills (`CONTEXT_MAP_SKILLS` in `cli/lib/context-maps.ts`, each `references/*-map.html`) and the Master Test Plan (the `QA Master Test Plan` Epic description in Jira, cached at `.context/PBI/qa-artifacts/master-test-plan.md`). Each map is owned by the generator its entry names (a `project-context` mode or a `project-discovery` phase) and the MTP by `project-context` mode `test-plan`. The skill folders themselves are framework surface; their maps are the project's. TMS modality and the Regression Epic are resolved live by `/test-documentation` from `.agents/project.yaml` and Jira, with no `.context/` file.
- **Credentials and env**: `.env` and `.env.example`. Only the variable list may be appended when adding a new framework env var, never values.
- **Playwright artifacts (gitignored)**: `test-results/`, `tests/data/downloads/`, `playwright/.auth/`.
- **Test results and TMS sync state**: outputs of CI runs, not framework code.
- **Skills and instructions**: a framework change that has to surface in AI memory patches the section under `.agents/instructions/` that owns the fact, through mode `instructions` and the decision tree in `instructions-doctrine.md`. `AGENTS.md` itself changes only for an L0 rule sentence or a ROUTER row, and a row only behind an ADR; the skill table is `agent-skills-and-mcps.md`. The docs follow in the same PR (the docs follow-through in `SKILL.md` Phase 3), and `bun run docs:check` proves the router and the quoted scripts.

---

## 10. ALLOWED and FORBIDDEN paths (POLICY)

Two tables gate every `framework-development` change. ALLOWED lists the surface this skill owns, and FORBIDDEN redirects to the skill that owns the path. Phase 0 of `framework-development/SKILL.md` cites this section by name, so keep the tables flat and grep-friendly.

These are policy tables, not invariants. They can be amended additively without a major-version bump (for example when a new layer or fixture type appears), but only through a `/framework-development` change that touches this file.

### 10.1 ALLOWED paths (framework surface)

| Path                                                  | Why it lives here                                                                                                |
|-------------------------------------------------------|------------------------------------------------------------------------------------------------------------------|
| `cli/`                                                | Installer, agents:setup and vars:check: project-level tooling that ships with every clone                        |
| `scripts/`                                            | `bun run` script implementations (`api:sync`, `kata:manifest`, `jira:sync-fields`, `skills:check`, etc.)         |
| `.agents/` (structure changes only)                   | Schema for `project.yaml`, `jira-fields.json`, `jira-workflows.json`, `jira-required.yaml`. Values stay manual.  |
| `tests/utils/`                                        | Agnostic utilities: Allure attach helpers, decorators, formatters. Evolution of the utility layer.               |
| `tests/components/` (Layer 2 + 3 base classes only)   | `TestContext.ts`, `ApiBase.ts`, `UiBase.ts`. Not per-module `*Api.ts` / `*Page.ts` (those are test-automation). |
| `tests/components/` (fixture files)                   | Fixture registry evolution: `ApiFixture.ts`, `UiFixture.ts`, `TestFixture.ts`. New fixture APIs.                 |
| `scripts/sync-openapi.ts` and the sync pipeline       | Pipeline source. Not the generated `api/openapi-types.ts` (regenerated by `bun run api:sync`).                   |
| `package.json` deps + scripts                         | Dependency upgrades, script registry, engines. Not test specs in `tests/`.                                       |
| `.agents/skills/agentic-qa-core/references/`          | Briefing template, dispatch patterns, orchestration doctrine, skill-composition-strategy.                        |
| `.agents/skills/framework-development/`               | This skill itself: references, scripts, agents/.                                                                 |
| `AGENTS.md`, `.agents/instructions/` (mode `instructions`) | The instruction layers: L0 sentences, sections, the ROUTER (behind its ADR lock), `triggers:`; placement per `instructions-doctrine.md`. |
| `cli/lib/fixtures/instruction-router-eval.json`       | The router eval's labelled prompts. It grows with every trigger miss and is never relabelled to hide one.        |

### 10.2 FORBIDDEN paths (redirect map)

| Path                                                | Owned by                                                                                       |
|-----------------------------------------------------|------------------------------------------------------------------------------------------------|
| `tests/e2e/`                                        | `/test-automation`: per-ticket E2E specs                                                        |
| `tests/integration/`                                | `/test-automation`: per-ticket API/integration specs                                            |
| `tests/components/{module}/` (Page/Api/Steps)       | `/test-automation`: module-specific Domain components and Steps                                 |
| `.context/PBI/`                                     | `/sprint-testing`: per-ticket QA context                                                        |
| `.context/PBI/qa-artifacts/master-test-plan.md`     | Sync cache of the MTP Epic; `project-context` mode `test-plan` writes the Epic                  |
| `.agents/skills/<context map skill>/references/*-map.html` | The generator named in `CONTEXT_MAP_SKILLS` (and each skill's own refresh): regenerative |
| `api/openapi-types.ts`                              | Generated artifact, regenerated by `bun run api:sync`                                           |
| `kata-manifest.json`, `reports/atc_results.json`, `reports/test-outcomes.json` | Generated artifacts: runtime and build outputs                                |
| `.env`, credentials                                 | Manual edit only: no skill, no AI rewrite                                                       |

### 10.3 Tie-break rules

- A path that matches neither table is asked about explicitly. Nothing is assumed.
- A change that spans both tables is split. `framework-development` owns the framework slice, and the FORBIDDEN row's owner takes the consumer slice in a follow-up.
- Hot-spot exception: a change to `tests/components/{module}/` that only renames or moves existing files as part of a base-class evolution is still owned by `/test-automation`. Coordinate through the split rule instead of reaching for the file from this skill.

---

*Compiled from `kata-architecture.md`, `typescript-patterns.md`, `api-patterns.md`, `e2e-patterns.md`, `atc-tracing.md`, `automation-standards.md`, `data-testid-strategy.md`, `test-data-management.md`, `review-checklists.md` and `test-automation/SKILL.md`. Update it only when a source doc changes a load-bearing rule.*
