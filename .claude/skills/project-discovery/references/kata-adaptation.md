# KATA Adaptation — Setup Phase

> Read this during the Setup phase (after Phase 3 Infrastructure is complete). Adapts the boilerplate's KATA layers to the target project's stack, auth, and domain. Two strict sub-phases: **Plan** (no writes) -> user approval -> **Implement** (writes).

This reference is purely about KATA mechanics: layer templates, auth strategy, OpenAPI integration, validation. It does NOT cover regenerating context files (`business-data-map.md`, `master-test-plan.md`) — those are in `context-generators.md`. API endpoint sync is owned by `bun run api:sync` (technical types) and the `/business-api-map` command (business angle).

---

## The KATA 4-Layer Architecture

```
Layer 1: TestContext        — Config + Faker + agnostic utilities (no Playwright)
   |
   v
Layer 2: ApiBase / UiBase   — HTTP client / Playwright Page helpers
   |
   v
Layer 3: Domain Components  — {Entity}Api, {Entity}Page (ATCs live here)
   |
   v
Layer 4: TestFixture        — Dependency injection (ApiFixture, UiFixture, TestFixture)
                              + Test files orchestrate ATCs
```

**Golden rules** (these never change per project):

- ATCs are complete test cases (mini-flows), not single interactions.
- ATCs are atomic: never call other ATCs. Use `tests/components/steps/` for chains.
- Locators stay inline in ATCs unless used 2+ times — then promoted to constructor.
- Components NEVER import from `@openapi`. They import from `@schemas/{domain}.types` (Type Facade Pattern).
- All ATCs decorated with `@atc('TICKET-ID')` for traceability.
- Imports use aliases: `@api/`, `@ui/`, `@schemas/`, `@utils/`, `@variables`.

---

## Phase 1 — Analysis + Plan (no writes)

Six investigative steps, then the plan file.

### 1. Read project context

Mandatory inputs (assumes Phase 1-3 of discovery already ran):

```
.context/SRS/architecture.md           # tech stack, services
.context/SRS/api-contracts.md          # endpoints + auth model
.context/mapping/business-feature-map.md   # entities to scaffold (from /business-feature-map command)
.context/PRD/business/domain-glossary.md       # entity names, casing
.context/mapping/business-data-map.md          # main flows
.context/infrastructure/backend.md     # auth flow, env vars
api/schemas/                           # endpoint types from `bun run api:sync` (if available)
```

If any of these is missing, route the user back to the missing discovery phase. Do not try to scaffold KATA against guesses.

### 2. Read template structure

```
tests/setup/global.setup.ts          # session prep
tests/setup/api-auth.setup.ts        # API auth session
tests/setup/ui-auth.setup.ts         # UI auth session

tests/components/TestContext.ts      # Layer 1
tests/components/TestFixture.ts      # Layer 4 (unified)
tests/components/ApiFixture.ts       # Layer 4 (API only)
tests/components/UiFixture.ts        # Layer 4 (UI only)
tests/components/api/ApiBase.ts      # Layer 2
tests/components/api/AuthApi.ts      # Layer 3 reference
tests/components/ui/UiBase.ts        # Layer 2
tests/components/ui/LoginPage.ts     # Layer 3 reference

api/schemas/auth.types.ts            # Type facade reference
api/schemas/example.types.ts         # New-facade template
api/schemas/index.ts                 # Barrel re-export
api/openapi.json                     # Synced spec (if any)
api/openapi-types.ts                 # Generated types

config/variables.ts                  # env config (single source of truth)
playwright.config.ts                 # Playwright projects
.env.example                         # required env vars
```

### 3. Authentication strategy decision tree

The single most error-prone part. Pick one branch per project.

```
Does the target API issue a session token or cookie?
|
+-- TOKEN (Bearer / JWT / API key)
|     |
|     +-- Token returned in response body
|     |     -> Strategy: API-login + storageState file (.auth/api-state.json)
|     |     -> Setup: api-auth.setup.ts hits POST /auth/login, saves token
|     |     -> Components: ApiBase.setAuthToken(token) on each fixture
|     |
|     +-- Token returned via UI flow only (e.g., OAuth redirect)
|           -> Strategy: UI login first, intercept token from network
|           -> Setup: ui-auth.setup.ts performs full UI login
|           -> Save storageState (.auth/user.json) for E2E tests
|           -> Optionally extract token from storageState for API tests
|
+-- COOKIE (session-based, no token)
|     -> Strategy: Playwright storageState only
|     -> Setup: ui-auth.setup.ts logs in, saves storageState
|     -> API tests reuse the same storageState (Playwright sends cookies automatically)
|
+-- HYBRID (CSRF + cookie + bearer)
      -> Strategy: UI login -> storageState -> extract CSRF + bearer separately
      -> Document both in api-auth.setup.ts; add CSRF header on every API request
```

**Session reuse pattern (always the same shape):**

```
global.setup.ts          --> creates .auth/ dir, clears stale state
       |
       +--> ui-auth.setup.ts    --> logs in via UI    --> .auth/user.json
       |
       +--> api-auth.setup.ts   --> logs in via API   --> .auth/api-state.json

E2E tests       --> use storageState .auth/user.json (already logged in)
Integration     --> use saved token from .auth/api-state.json
```

### 4. Identify OpenAPI source

| Source | When to use | Example |
|--------|-------------|---------|
| URL | Backend serves OpenAPI at an endpoint | `http://localhost:3000/api/openapi` (Next.js + Zod), `http://localhost:PORT/swagger/v1/swagger.json` (.NET/Spring), `/openapi.json` (FastAPI) |
| GitHub | Spec committed as a file in a repo | `owner/repo` + `docs/openapi.yaml` |
| Local | File already on disk | `../backend/docs/openapi.json` |
| None | No spec available | Fall back to Custom Types in facades |

Pick during planning. If "None", the plan must call out that all type facades will use hand-written interfaces — slower to maintain, but correct.

### 5. Identify components to create

Map domain entities (from `domain-glossary.md` and `business-feature-map.md`) to components.

| Always needed | Per entity |
|---------------|------------|
| `AuthApi.ts` (modify existing) | `{Entity}Api.ts` for each main entity |
| `LoginPage.ts` (modify existing) | `{Entity}Page.ts` for each main page/feature |
| `auth.types.ts` (modify existing) | `{domain}.types.ts` for each domain |

Do not scaffold every entity at once. Pick the **first priority entity** (highest-traffic flow per `master-test-plan.md`) and ship that end-to-end before adding more.

### 6. Generate the adaptation plan

Write `.context/PBI/kata-architecture-adaptation-plan.md` with these sections:

```markdown
# KATA Architecture Adaptation Plan

> Generated: {DATE}
> Project: {PROJECT_NAME}
> Status: PENDING APPROVAL

## 1. Project Summary
| Aspect | Value |
|--------|-------|
| Stack | {frontend} + {backend} + {database} |
| Auth System | {OAuth/JWT/Session/Cookie+CSRF} |
| Main Entities | {list} |
| OpenAPI Source | {URL / GitHub / Local / None} |

## 2. Authentication Strategy
- API auth method, endpoint, token format, refresh strategy
- UI login URL, form fields, success indicator
- Session reuse approach (which storageState files)

## 3. OpenAPI & Type Strategy
- Sync command (e.g., `bun run api:sync --url http://localhost:3000/api/openapi -t`)
- Type facades to create (table: file, domain, schema names, priority)

## 4. Components to Create
- API components (table: name, file, endpoints, types, priority)
- UI components (table: name, file, pages, priority)

## 5. Files to Modify
- `config/variables.ts` (URLs, auth endpoints)
- `.env` (credentials)
- `api/schemas/auth.types.ts`, `index.ts`
- `tests/components/api/AuthApi.ts`, `tests/components/ui/LoginPage.ts`
- `tests/components/ApiFixture.ts`, `UiFixture.ts`
- `playwright.config.ts` (baseURL if needed)

## 6. Environment Variables (.env scaffold)

## 7. Implementation Phases (A: auth+OpenAPI, B: first domain, C: validation)

## 8. Approval Checklist
```

The plan ends with: **Wait for explicit user approval before proceeding to Phase 2.**

---

## Phase 2 — Implementation (writes)

Trigger: user approves the plan. Read the plan back before writing code so you do not drift from it.

### Step A — Configuration

**`config/variables.ts`** — update `envDataMap` with `baseUrl` + `apiUrl` per environment, update `auth` with `loginEndpoint` / `tokenEndpoint` / `meEndpoint`. Verify `testUser` reads `.env` keys correctly.

**`.env`** — `cp .env.example .env`, fill with project values:

```env
BASE_URL=https://staging.yourproject.com
API_URL=https://api.staging.yourproject.com
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=...
TEST_ENV=staging
```

### Step B — OpenAPI sync (skip if no spec)

```bash
# Interactive (first time)
bun run api:sync -t

# Or with explicit URL
bun run api:sync --url http://localhost:3000/api/openapi -t

# Or from local file
bun run api:sync --file ../backend/docs/openapi.yaml -t
```

Result:

```
api/openapi.json          # downloaded spec
api/openapi-types.ts      # generated TypeScript types
api/.openapi-config.json  # saved config for future syncs (use -c)
```

For future re-syncs without prompts: `bun run api:sync -c -t`.

### Step C — Type Facades

Pattern: `openapi-types.ts -> {domain}.types.ts -> components`. Components NEVER import directly from `@openapi`.

**`api/schemas/auth.types.ts`** — already exists with TODO migration. With OpenAPI:

```typescript
import type { components, paths } from '@openapi';

// Schema Types
export type TokenResponse = components['schemas']['TokenResponse'];
export type UserInfo = components['schemas']['UserInfoModel'];

// Endpoint Types - POST /api/auth/login
type LoginPath = paths['/api/auth/login']['post'];
export type LoginPayload = LoginPath['requestBody']['content']['application/json'];
export type LoginSuccessResponse = LoginPath['responses']['200']['content']['application/json'];

// Custom Types (not in OpenAPI spec)
export interface LoginCredentials {
  email: string
  password: string
}
```

Without OpenAPI: keep Custom Types only; hand-write interfaces matching the real API contract.

**New domain facade** (`api/schemas/{domain}.types.ts`) — copy from `example.types.ts`:

```typescript
import type { components, paths } from '@openapi';

export type Booking = components['schemas']['BookingModel'];

type ListBookingsPath = paths['/api/bookings']['get'];
export type BookingListResponse = ListBookingsPath['responses']['200']['content']['application/json'];

type CreateBookingPath = paths['/api/bookings']['post'];
export type CreateBookingRequest = CreateBookingPath['requestBody']['content']['application/json'];
export type CreateBookingResponse = CreateBookingPath['responses']['201']['content']['application/json'];
```

**Barrel re-export** (`api/schemas/index.ts`):

```typescript
export type * from './auth.types';
export type * from './booking.types';
```

**Aliases in `tsconfig.json`** — already configured in the boilerplate, verify they exist:

```json
{
  "compilerOptions": {
    "paths": {
      "@openapi": ["./api/openapi-types"],
      "@schemas/*": ["./api/schemas/*"],
      "@schemas": ["./api/schemas/index"]
    }
  }
}
```

### Step D — Adapt Auth Components

**`tests/components/api/AuthApi.ts`** — update endpoint and request shape:

```typescript
import type { LoginPayload, TokenResponse, LoginCredentials } from '@schemas/auth.types';

private readonly endpoints = {
  login: '/auth/login',
  me: '/auth/me',
};

@atc('PROJ-101')
async authenticateSuccessfully(creds: LoginCredentials): Promise<[APIResponse, TokenResponse, LoginPayload]> {
  const payload: LoginPayload = { email: creds.email, password: creds.password };
  const [response, body, sentPayload] = await this.apiPOST<TokenResponse, LoginPayload>(
    this.endpoints.login,
    payload,
  );
  expect(response.status()).toBe(200);
  return [response, body, sentPayload];
}
```

**`tests/components/ui/LoginPage.ts`** — update locators + success assertion:

```typescript
readonly emailInput    = () => this.page.getByTestId('email');
readonly passwordInput = () => this.page.getByTestId('password');
readonly submitButton  = () => this.page.getByRole('button', { name: 'Login' });

@atc('PROJ-101')
async loginSuccessfully(email: string, password: string) {
  await this.goto();
  await this.emailInput().fill(email);
  await this.passwordInput().fill(password);
  await this.submitButton().click();
  await expect(this.page).toHaveURL(/dashboard/);
}
```

### Step E — Verify auth setups

```bash
bun run test --project=api-setup
bun run test --project=ui-setup
```

Both must produce a non-empty `.auth/user.json` and `.auth/api-state.json`. If either fails, do not proceed — the rest of the suite depends on session reuse.

### Step F — First domain component

**`tests/components/api/{Entity}Api.ts`** — extends `ApiBase`, defines `endpoints` map, implements one ATC per operation. Each ATC: imports types from `@schemas/{domain}.types`, calls `apiGET`/`apiPOST`/etc., asserts status, returns `[response, body, sentPayload?]`.

```typescript
import type { Booking, BookingListResponse, CreateBookingRequest, CreateBookingResponse } from '@schemas/booking.types';
import type { APIResponse } from '@playwright/test';
import { ApiBase } from '@api/ApiBase';
import { expect } from '@playwright/test';
import { atc } from '@utils/decorators';

export class BookingApi extends ApiBase {
  private readonly endpoints = {
    list: '/api/bookings',
    get: (id: string) => `/api/bookings/${id}`,
    create: '/api/bookings',
  };

  @atc('PROJ-201')
  async getBookingSuccessfully(id: string): Promise<[APIResponse, Booking]> {
    const [response, body] = await this.apiGET<Booking>(this.endpoints.get(id));
    expect(response.status()).toBe(200);
    return [response, body];
  }

  @atc('PROJ-202')
  async createBookingSuccessfully(payload: CreateBookingRequest): Promise<[APIResponse, CreateBookingResponse, CreateBookingRequest]> {
    const [response, body, sent] = await this.apiPOST<CreateBookingResponse, CreateBookingRequest>(this.endpoints.create, payload);
    expect(response.status()).toBe(201);
    return [response, body, sent];
  }
}
```

**`tests/components/ui/{Entity}Page.ts`** — extends `UiBase`, exposes a `goto()` plus one ATC per UI flow. Same `@atc` decorator + inline-locator rules apply.

### Step G — Wire fixtures

**`tests/components/ApiFixture.ts`** — register the new component:

```typescript
import { BookingApi } from '@api/BookingApi';

// in class
booking: BookingApi;

// in constructor
this.booking = new BookingApi(options);

// in setAuthToken(token)
this.booking.setAuthToken(token);

// in clearAuthToken()
this.booking.clearAuthToken();
```

**`tests/components/UiFixture.ts`** — same shape:

```typescript
import { BookingPage } from '@ui/BookingPage';

// in class
bookingPage: BookingPage;

// in constructor
this.bookingPage = new BookingPage(options);
```

### Step H — First test

`tests/e2e/booking/smoke.test.ts` — verifies auth + navigation + at least one domain operation. Tag with `@smoke` so it joins the smoke suite.

---

## Validation checklist (what "good" looks like)

Run in this exact order. Each gate must pass before the next:

```bash
# 1. TypeScript compilation
bun run type-check

# 2. Lint
bun run lint

# 3. Auth setups
bun run test --project=api-setup
bun run test --project=ui-setup

# 4. Smoke
bun run test --grep @smoke

# 5. Session reuse (run twice; second run must reuse .auth/*)
bun run test --grep @smoke
```

Adapted KATA is "done" when:

- [ ] `type-check` exits 0
- [ ] `lint` exits 0
- [ ] `api-setup` produces `.auth/api-state.json` with a real token
- [ ] `ui-setup` produces `.auth/user.json` with a real session
- [ ] At least one `@smoke` test passes against staging
- [ ] A second smoke run reuses the auth state (no re-login)
- [ ] No component imports directly from `@openapi` (only facades do)
- [ ] All ATCs carry `@atc('TICKET-ID')`
- [ ] All imports use aliases (no `../../` relative paths)

---

## Common pitfalls and fixes

| Pitfall | Fix |
|---------|-----|
| Hardcoded credentials | Always read from `.env` (`TEST_USER_EMAIL`, `TEST_USER_PASSWORD`) |
| Token field name mismatch (`access_token` vs `token` vs `id_token`) | Inspect real response (`curl -X POST <login> -d '{...}' \| jq .`) before writing the facade |
| Cookie auth without `storageState` | Save `storageState` in `ui-auth.setup.ts`, reference it in `playwright.config.ts` projects |
| Component imports from `@openapi` | Move all `@openapi` imports into `api/schemas/*.types.ts`; components only import from `@schemas/...` |
| OpenAPI sync against wrong env | Pin sync to a stable env; consider committing `api/openapi.json` per environment |
| Brittle CSS locators | Prefer `getByTestId` / `getByRole`; request `data-testid` from frontend team |
| Login success assertion too loose | Assert URL change AND a post-login element (e.g., `getByTestId('user-menu')`) |
| Skipping `@atc` decorator | Every ATC must carry `@atc('TICKET-ID')` — required by Xray/TMS reporters |
| Auth setup parallel with tests | Use Playwright `dependencies:` project, not a parallel one — avoids `.auth/*` races |
| Forgetting `api/schemas/index.ts` barrel | Re-export every new facade |
| OpenAPI URL behind auth | Run sync against an unauthenticated endpoint or extend the sync script with auth headers |

**Quick troubleshooting:** auth fails -> verify `AuthApi.endpoints.login`, `.env`, and the real token shape via curl. UI login fails -> verify locators against DevTools and tighten the success assertion. Type errors -> re-check `@openapi` / `@schemas` aliases in `tsconfig.json` and that schema names in facades match `api/openapi-types.ts`. OpenAPI sync fails -> backend reachable? `curl -s <url> | head -5`. Re-run with `bun run api:sync -t` without saved config.

---

## File inventory (per phase)

**Always modified:** `config/variables.ts`, `.env`, `api/schemas/auth.types.ts`, `api/schemas/index.ts`, `tests/components/api/AuthApi.ts`, `tests/components/ui/LoginPage.ts`, `tests/components/ApiFixture.ts`, `tests/components/UiFixture.ts`, `playwright.config.ts` (only if `baseURL` changes).

**Created per project:** `api/schemas/{domain}.types.ts`, `tests/components/api/{Entity}Api.ts`, `tests/components/ui/{Entity}Page.ts`, `tests/e2e/{feature}/*.test.ts`, `tests/integration/{feature}/*.test.ts`.

**Generated by tooling:** `api/openapi.json` + `api/openapi-types.ts` + `api/.openapi-config.json` (via `bun run api:sync`); `.auth/user.json` (via `ui-auth.setup.ts`); `.auth/api-state.json` (via `api-auth.setup.ts`).

---

## Discovery Gaps (per output)

Every adaptation plan must end with a `## Discovery Gaps` section listing items that could not be verified from the source repo and require human input. Examples: token refresh strategy when login endpoint is documented but refresh is not, multi-tenant header scheme not visible from a single login flow, role-based access flows when only one test user is provisioned.

Do not invent values. Mark gaps explicitly so the user fills them before approving the plan.
