---
name: adapt-framework
description: Adapt this boilerplate's KATA test architecture (tests/, api/schemas/, config/) to a project already reverse-engineered by `/project-discovery`. Triggers on "adapt KATA to this project", "set up test framework for this project", "implement the test fixtures", "connect boilerplate to target stack", "wire auth for the framework". Two strict sub-phases: Plan (no writes) → user approval → Implement (writes). Modifies THIS repo only — never the target repo. Prerequisites: `.context/` populated by `/project-discovery`. Do NOT use for writing feature tests (`/test-automation`), running suites (`/regression-testing`), or regenerating context (`/project-discovery`).
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
---

# Adapt Framework — Wire KATA to the target project

Adapt this boilerplate's 4-layer KATA test architecture (Config + Schemas + Components + Fixtures) so it speaks to the project already reverse-engineered by `/project-discovery`. You modify **this repo only**. The target repo is read-only from here on.

**Target**: $ARGUMENTS (leave blank to adapt the full framework; pass an entity name like `booking` to scope the first domain component)

---

## When to use

| Use this command for | Use a different tool for |
|----------------------|--------------------------|
| Wiring `AuthApi` + `LoginPage` against real endpoints | Regenerating `.context/` files → `/project-discovery` |
| Creating the first `{Entity}Api` / `{Entity}Page` | Writing sprint-level feature tests → `/test-automation` |
| Registering fixtures and running the first smoke | Running regression suites → `/regression-testing` |
| Syncing OpenAPI and creating type facades | Documenting test cases in TMS → `/test-documentation` |

---

## Prerequisites (required inputs)

Verify every bullet before drafting the plan. If any is missing, stop and route the user to the owning command.

- [ ] `.context/PRD/` populated (at least `README.md` + one business document)
- [ ] `.context/SRS/` populated (at least `architecture.md` + `api-contracts.md`)
- [ ] `.context/infrastructure/backend.md` and `.context/infrastructure/frontend.md` present
- [ ] `.context/mapping/business-data-map.md` present
- [ ] `.context/mapping/business-api-map.md` present **or** a reachable OpenAPI spec URL (optional but recommended)
- [ ] `.env.example` exists; `.env` either exists or will be created from it during Phase 2

If any of the first four bullets fail, stop with:

> This command needs `.context/` populated by `/project-discovery`. Run `/project-discovery` first (or complete the missing phase manually), then re-invoke `/adapt-framework`.

Do not scaffold KATA against guesses.

---

## Two-phase contract

```
Phase 1 — Analysis + Plan          → .context/PBI/adapt-framework-plan.md
                                     No writes to target code. WAIT for user approval.
                         ↓ (approved)
Phase 2 — Implementation           → writes to config/, api/schemas/, tests/components/**,
                                     tests/setup/**, tests/e2e/{feature}/*, .env
                                     Fail-fast validation gates at the end.
```

Never skip Phase 1. Never start Phase 2 without explicit user approval on the plan file.

---

## Phase 1 — Analysis + Plan (no writes)

### 1.1 Read existing project context

Read in this order: `.context/SRS/architecture.md`, `.context/SRS/api-contracts.md`, `.context/mapping/business-data-map.md`, `.context/mapping/business-feature-map.md` (if present), `.context/mapping/business-api-map.md` (if present), `.context/infrastructure/backend.md`, `.context/infrastructure/frontend.md`, `.context/PRD/business/domain-glossary.md` (if present), `.env.example`.

### 1.2 Read KATA references

Load these from `.claude/skills/test-automation/references/` (HOW-to lives here, not in this command):

- `kata-architecture.md` — layers, Steps module, fixtures
- `automation-standards.md` — golden rules
- `api-patterns.md` — API component shape
- `e2e-patterns.md` — Page component shape
- `data-testid-strategy.md` — locator policy
- `typescript-patterns.md` — aliases, types, imports
- `ci-integration.md` — auth setup + session reuse

### 1.3 Inspect template structure

Confirm the current surface of this repo (do not rename, do not move files in Phase 1):

```
tests/components/{TestContext,TestFixture,ApiFixture,UiFixture}.ts
tests/components/api/{ApiBase,AuthApi,ExampleApi}.ts
tests/components/ui/{UiBase,LoginPage,ExamplePage}.ts
tests/components/steps/ExampleSteps.ts
tests/setup/{global,api-auth,ui-auth}.setup.ts
api/schemas/{auth,example}.types.ts + index.ts
config/variables.ts · playwright.config.ts · .env.example
```

### 1.4 Decide auth strategy (decision tree)

```
Does the target API issue a token or a cookie?
│
├── TOKEN (Bearer / JWT / API key)
│     ├── Token returned in response body
│     │     → API-login + storageState .auth/api-state.json
│     │     → api-auth.setup.ts → POST /auth/login → ApiBase.setAuthToken(token)
│     └── Token returned via UI-only flow (OAuth redirect)
│           → ui-auth.setup.ts runs full UI login, storageState .auth/user.json
│           → Optionally extract token from storageState for API tests
│
├── COOKIE (session-based)
│     → storageState only; Playwright forwards cookies automatically
│
└── HYBRID (CSRF + cookie + bearer)
      → UI login → storageState → extract CSRF + bearer separately
      → Add CSRF header on every API request inside ApiBase
```

Session reuse always has the same shape: `global.setup → ui-auth.setup + api-auth.setup → .auth/*.json → tests`.

### 1.5 Identify OpenAPI source

| Source | When | Plan action |
|--------|------|-------------|
| URL    | Backend serves a spec endpoint | `bun run api:sync --url <URL> -t` |
| GitHub | Spec committed in a repo file  | `bun run api:sync` (interactive → GitHub) |
| Local  | Spec file on disk              | `bun run api:sync --file <path> -t` |
| None   | No spec available              | Hand-write type facades; log in Discovery Gaps |

### 1.6 Map entities to components (first one end-to-end)

From `domain-glossary.md` + `business-feature-map.md`, pick the **highest-traffic entity** per `master-test-plan.md`. Build that entity end-to-end in Phase 2; list the rest as "follow-ups" in the plan. Do not scaffold everything at once.

### 1.7 Upfront questionnaire

Before generating the plan, ask the user anything the context cannot reveal. Do not invent answers — ask short, specific questions. Typical gaps:

- Token refresh strategy (TTL, refresh endpoint, idle policy)?
- Multi-tenant scheme (subdomain, header, path prefix)?
- Test users per role (admin / member / guest) available in staging?
- Required email verification step after registration?
- 2FA / MFA enforced for the test user?
- Data-testid coverage on the login page, or must we fall back to `getByRole` / text?
- Rate limits or captcha that may break repeated auth setups in CI?

Fold the answers into §2 and §6 of the plan. Unanswered items go to Discovery Gaps.

### 1.8 Write the plan

Write `.context/PBI/adapt-framework-plan.md` with these sections:

1. **Project Summary** — stack, auth system, main entities, OpenAPI source
2. **Auth Strategy** — branch chosen from §1.4, endpoints, token shape, refresh rule, success indicator
3. **OpenAPI Strategy** — source, sync command, facades to create (one row per domain)
4. **Components to Create** — API components table, UI components table, Steps (if any)
5. **Files to Modify** — `config/variables.ts`, `.env`, `api/schemas/*`, `AuthApi.ts`, `LoginPage.ts`, fixtures, `playwright.config.ts` (only if `baseURL` changes)
6. **Env Vars Needed** — keys expected in `.env`
7. **Implementation Phases** — A (env + config + OpenAPI), B (first entity end-to-end), C (validation + smoke)
8. **AI Guidelines** — golden rules to follow during code writing (inline locators, @atc, alias imports, @schemas facades, never @openapi from components)
9. **Questions Answered** — verbatim answers from §1.7
10. **Discovery Gaps** — anything you could not verify (token refresh, multi-tenant, roles, missing OpenAPI, etc.)
11. **Approval Checklist** — checkboxes the user ticks before approving

Header block of the plan:

```markdown
> Generated: YYYY-MM-DD
> Project: {{PROJECT_NAME}}
> Status: PENDING APPROVAL
```

Close the plan with:

> WAIT for explicit user approval before starting Phase 2. Do not write code yet.

---

## Phase 2 — Implementation (writes)

Only start after user approval. Re-read the approved plan before writing code so you do not drift.

### Step A — Environment & config

- Copy `.env.example` → `.env` if it does not exist. Populate `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, `BASE_URL`, `API_URL`, `TEST_ENV`, plus any project-specific keys listed in the plan.
- Update `config/variables.ts`: `envDataMap` (`baseUrl`, `apiUrl` per environment), `auth.loginEndpoint`, `auth.tokenEndpoint`, `auth.meEndpoint`. Verify `testUser` reads from `.env`.
- Update `playwright.config.ts` only if `baseURL` or project dependencies changed.

Credentials always come from `.env`. Never hardcode.

### Step B — OpenAPI sync

Interactive (first time):

```bash
bun run api:sync -t
```

Prompts you will see:

```
? Select source type:    › URL / GitHub / Local file
? Enter OpenAPI URL:     › http://localhost:3000/api/openapi
? Save config for re-use? (Y/n)
```

Non-interactive alternatives: `--url <URL> -t`, `--file <path> -t`, or `bun run api:sync -c -t` to reuse saved config. Outputs `api/openapi.json`, `api/openapi-types.ts`, `api/.openapi-config.json`.

If no spec exists, skip this step and log it in Discovery Gaps — all facades will be hand-written.

### Step C — Type facades

Pattern: `openapi-types.ts → {domain}.types.ts → components`. Components **must** import from `@schemas/{domain}.types`, never from `@openapi`.

- Adapt `api/schemas/auth.types.ts` to the real login endpoint and token shape.
- Create `api/schemas/{entity}.types.ts` for the first domain entity (copy `example.types.ts` as template). Generic shape:

```typescript
import type { components, paths } from '@openapi';

export type {Entity} = components['schemas']['{Entity}Model'];

type List{Entities}Path = paths['/api/{entities}']['get'];
export type {Entity}ListResponse = List{Entities}Path['responses']['200']['content']['application/json'];

type Create{Entity}Path = paths['/api/{entities}']['post'];
export type Create{Entity}Request  = Create{Entity}Path['requestBody']['content']['application/json'];
export type Create{Entity}Response = Create{Entity}Path['responses']['201']['content']['application/json'];
```

- Update `api/schemas/index.ts` to re-export the new facade.
- Without OpenAPI: hand-write interfaces that match the real contract (curl the endpoint first, then mirror the shape).

### Step D — Adapt AuthApi + LoginPage

`tests/components/api/AuthApi.ts` — update `endpoints.login`, payload shape, and types imported from `@schemas/auth.types`. Keep every ATC decorated with `@atc('TICKET-ID')`.

`tests/components/ui/LoginPage.ts` — update locators using the data-testid strategy (`getByTestId` / `getByRole`). Keep assertions tight (URL change AND a post-login element).

### Step E — Verify auth setups

```bash
bun run test --project=api-setup
bun run test --project=ui-setup
```

Both must produce non-empty `.auth/api-state.json` and `.auth/user.json`. If either fails, stop — the rest of the suite depends on session reuse.

### Step F — First domain component

Create `tests/components/api/{Entity}Api.ts` and `tests/components/ui/{Entity}Page.ts` following KATA (`kata-architecture.md`, `api-patterns.md`, `e2e-patterns.md`). Generic shape for the API component:

```typescript
export class {Entity}Api extends ApiBase {
  private readonly endpoints = {
    list: '/api/{entities}',
    get: (id: string) => `/api/{entities}/${id}`,
    create: '/api/{entities}',
  };

  @atc('PROJ-201')
  async get{Entity}Successfully(id: string): Promise<[APIResponse, {Entity}]> {
    const [response, body] = await this.apiGET<{Entity}>(this.endpoints.get(id));
    expect(response.status()).toBe(200);
    return [response, body];
  }
}
```

**Delete the template files** once the first real entity is in place:

- `tests/components/api/ExampleApi.ts`
- `tests/components/ui/ExamplePage.ts`
- `tests/components/steps/ExampleSteps.ts`
- `api/schemas/example.types.ts` (also drop its re-export from `api/schemas/index.ts`)

These are references, not production code. Either delete them or overwrite them with the real entity — never leave both.

### Step G — Wire fixtures

Register the new component in `tests/components/ApiFixture.ts`, `UiFixture.ts`, and `TestFixture.ts` (if used by hybrid tests). Include `setAuthToken` / `clearAuthToken` wiring when the API component needs auth. Use aliases (`@api/{Entity}Api`, `@ui/{Entity}Page`) — no relative imports.

### Step H — First smoke test

Create `tests/e2e/{feature}/smoke.test.ts` (or `tests/integration/{feature}/smoke.test.ts` for API-only) tagged `@smoke`. Uses the new component through the fixture, asserts at least one domain operation end-to-end. No mocks against real auth flows.

### Validation order (fail-fast)

Run in this exact order. Stop on the first failure and report with diagnostics — do not auto-fix without approval.

```bash
1. bun run type-check
2. bun run lint
3. bun run test --project=api-setup
4. bun run test --project=ui-setup
5. bun run test:smoke            # first run against staging
6. bun run test:smoke            # second run — must reuse .auth/*, no re-login
```

If run #6 re-runs the auth setup, session reuse is broken. Check `playwright.config.ts` project dependencies and `.auth/*` freshness before proceeding.

### Report completion

Once all six gates pass:

- Update `AGENTS.md` (CLAUDE.md is a symlink) with project-specific info discovered during adaptation: the resolved auth strategy, the first entity wired, the OpenAPI source, any Discovery Gaps still open.
- Mark `.context/PBI/adapt-framework-plan.md` as `Status: COMPLETED` and append a short results block (files created/modified, tests passing, gaps remaining).
- Report to the user: entities wired, facades created, setups passing, smoke passing, session reuse verified.

---

## Completion gate

Adaptation is "done" only when **every** checkbox is true:

- [ ] `bun run type-check` exits 0
- [ ] `bun run lint` exits 0
- [ ] `bun run test:smoke` passes on staging with at least one `@smoke` test
- [ ] Second smoke run reuses `.auth/*` (no re-login)
- [ ] Files listed in the plan's §5 match what is on disk
- [ ] No component imports from `@openapi` (only facades do)
- [ ] Every ATC carries `@atc('TICKET-ID')`
- [ ] All imports use aliases (no `../../`)
- [ ] `AGENTS.md` updated with project-specific info
- [ ] `.context/PBI/adapt-framework-plan.md` marked `COMPLETED`

---

## Common adaptation points

| Point | Current (template) | Target (you adapt it) |
|-------|--------------------|------------------------|
| Login endpoint | `POST /auth/login` | Real path from `api-contracts.md` |
| Token format | `Bearer <jwt>` in response body | `access_token` / `id_token` / cookie / hybrid |
| Success URL after login | Regex `/dashboard/` | Project's post-login route |
| API base prefix | `/api` | `/api/v1`, `/v2`, subdomain, or none |
| Data-testid coverage | `getByTestId('email')` | Whatever the frontend exposes — request `data-testid` if missing |
| Email verification | Not in template | Add step in `ui-auth.setup.ts` if enforced |
| Tenant / workspace scope | None | Header, subdomain, or path segment per the auth strategy |

---

## References

- `.claude/skills/test-automation/references/kata-architecture.md` — layers, Steps module, fixtures
- `.claude/skills/test-automation/references/automation-standards.md` — golden rules
- `.claude/skills/test-automation/references/api-patterns.md` — API component shape
- `.claude/skills/test-automation/references/e2e-patterns.md` — UI / E2E component shape
- `.claude/skills/test-automation/references/data-testid-strategy.md` — locator policy
- `.claude/skills/test-automation/references/typescript-patterns.md` — aliases, types, imports
- `.claude/skills/test-automation/references/ci-integration.md` — auth setup + session reuse

---

## Gotchas

- Auth is the most fragile part — always test against real staging, never mocks.
- Credentials live in `.env`. Hardcoding them is a hard stop.
- Golden KATA rule: components import from `@schemas/*`, never from `@openapi`. Keep `@openapi` scoped to facades.
- Steps (Layer 3.5) do not carry `@atc` and have no fixed assertions — they chain ATCs, nothing else.
- `ExampleApi.ts`, `ExamplePage.ts`, `ExampleSteps.ts`, `example.types.ts` are templates. Delete them when the first real entity is wired — do not ship both.
- Session reuse: the second smoke run should be noticeably faster. If it isn't, `auth.setup` is re-running and session reuse is broken.
- Locator policy: `getByTestId` / `getByRole` over CSS / XPath. If the frontend lacks `data-testid`, request coverage before writing tests.
- No OpenAPI spec available → all type facades are hand-written and that fact goes into Discovery Gaps.
