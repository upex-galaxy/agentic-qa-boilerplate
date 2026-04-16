# API Patterns — Components, OpenAPI Types, Status Matrix

How to write a KATA `Api` component and integration test. Load when building a new API component, importing OpenAPI types, choosing ATCs for success/error status codes, or handling auth headers. KATA layer mechanics (tuple returns, `ApiBase.apiGET/POST/...`, ATC atomicity, fixture selection) live in `kata-architecture.md` and `automation-standards.md` — this reference only covers API-specific mechanics.

---

## 1. Where API code lives

```
api/
  openapi.json                 # downloaded spec (gitignored)
  openapi-types.ts             # auto-generated types (committed)
  .openapi-config.json         # sync metadata (gitignored)
  schemas/                     # type facade files (see §4)
    index.ts                   # barrel re-export
    auth.types.ts              # one file per domain
    orders.types.ts

tests/components/api/
  ApiBase.ts                   # Layer 2 — HTTP helpers, auth, Allure attach
  AuthApi.ts                   # Layer 3 — one file per resource
  OrdersApi.ts
tests/components/ApiFixture.ts # registers every Api component
tests/integration/{module}/{verbResource}.test.ts
```

Integration tests live under `tests/integration/**` and use the `{ api }` fixture (no browser opens).

---

## 2. API component skeleton

```typescript
import type { APIResponse } from '@playwright/test';
import type { TestContextOptions } from '@TestContext';
import { expect } from '@playwright/test';
import { ApiBase } from '@api/ApiBase';
import { atc, step } from '@utils/decorators';

// Import typed payloads/responses from the facade — NEVER from '@openapi'
import type {
  Order,
  CreateOrderRequest,
  CreateOrderResponse,
  OrderErrorResponse,
} from '@schemas/orders.types';

export class OrdersApi extends ApiBase {
  private readonly baseEndpoint = '/api/v1/orders';

  constructor(options: TestContextOptions) { super(options); }

  @step
  async getOrderById(id: string): Promise<[APIResponse, Order]> {
    return this.apiGET<Order>(`${this.baseEndpoint}/${id}`);
  }

  @atc('TICKET-ID')
  async createOrderSuccessfully(
    payload: CreateOrderRequest,
  ): Promise<[APIResponse, CreateOrderResponse, CreateOrderRequest]> {
    const [response, body, sent] = await this.apiPOST<CreateOrderResponse, CreateOrderRequest>(
      this.baseEndpoint, payload,
    );
    expect(response.status()).toBe(201);
    expect(body.id).toBeDefined();
    expect(body.customerId).toBe(payload.customerId);
    return [response, body, sent];
  }
}
```

Method order: base endpoint → constructor → helpers (`@step`, no `@atc`) → success ATCs → error ATCs. Max 15–20 ATCs per file; split by resource.

---

## 3. ApiBase — HTTP helpers

ApiBase wraps `APIRequestContext` with typed tuple returns and automatic Allure attachment. Never call `request.fetch` directly from a Layer-3 component.

| Method | Return | Purpose |
|--------|--------|---------|
| `apiGET<T>(path, opts?)` | `[APIResponse, T]` | Read |
| `apiPOST<T, P>(path, payload, opts?)` | `[APIResponse, T, P]` | Create |
| `apiPUT<T, P>(path, payload, opts?)` | `[APIResponse, T, P]` | Full update |
| `apiPATCH<T, P>(path, payload, opts?)` | `[APIResponse, T, P]` | Partial update |
| `apiDELETE<T>(path, opts?)` | `[APIResponse, T]` | Delete |

### Tuple pattern

GET/DELETE return 2-tuples (`response`, `body`). Mutation verbs return 3-tuples (`response`, `body`, `sentPayload`) so downstream assertions can compare what went in against what came back.

```typescript
const [response, body] = await this.apiGET<UserResponse>('/users/1');
const [resp, body, sent] = await this.apiPOST<UserResponse, CreateUserPayload>('/users', payload);
```

### Request options

```typescript
interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string>;
  timeout?: number;
}

const [response, body] = await this.apiGET<SearchResults>('/search', {
  params: { q: 'test', limit: '10' },
  headers: { 'X-Custom-Header': 'value' },
  timeout: 30000,
});
```

### Query strings for list endpoints

```typescript
const qs = new URLSearchParams();
if (params?.page) qs.set('page', String(params.page));
if (params?.limit) qs.set('limit', String(params.limit));
const endpoint = qs.toString() ? `${this.baseEndpoint}?${qs}` : this.baseEndpoint;
const [response, body] = await this.apiGET<OrderListResponse>(endpoint);
```

Use `URLSearchParams` for safety; never string-concatenate values directly.

---

## 4. OpenAPI type facades

The single most important rule when OpenAPI is available: **only facade files import from `@openapi`**. Components import from `@schemas/{domain}.types`. This keeps the generated file cohesive and lets you evolve type names without rewriting every component.

### Generation flow

```
┌──────────────────────┐              ┌───────────────────────────────────┐
│  Backend (running)   │              │  Test Repo (KATA)                 │
│  /swagger/v1/        │── fetch ──>  │  api/openapi.json     (gitignored)│
│  swagger.json        │              │        ↓ openapi-typescript       │
└──────────────────────┘              │  api/openapi-types.ts (committed) │
                                      │        ↓ re-exported              │
                                      │  api/schemas/{domain}.types.ts    │
                                      │        ↓ imported                 │
                                      │  tests/components/api/{Domain}Api │
                                      └───────────────────────────────────┘
```

**Prerequisite**: The backend must be running and exposing its Swagger/OpenAPI spec. The URL is configured in `api/.openapi-config.json` or passed via `--url`. If the backend is not running, `api:sync` will fail with `Connection refused`.

**What gets committed**: Only `api/openapi-types.ts` is committed. `api/openapi.json` and `api/.openapi-config.json` are gitignored — they are local cache artifacts.

### Sync commands

| Command | Effect |
|---------|--------|
| `bun run api:sync` | Download spec + regenerate `openapi-types.ts` (default) |
| `bun run api:sync --url <url>` | Pull from a specific URL |
| `bun run api:sync --no-types` | Download only, skip type generation |
| `bun run api:sync --help` | Help |
| `bun run api:types` | Regenerate types from the existing `openapi.json` |

Run `bun run api:sync` before every automation session that touches new endpoints. Commit the regenerated `openapi-types.ts`. `openapi.json` and `.openapi-config.json` stay gitignored.

### Facade file template

Each `api/schemas/{domain}.types.ts` has up to three sections:

```typescript
import type { components, paths } from '@openapi';

// ── Schema types — domain models from components.schemas ──
export type Order = components['schemas']['OrderListModel'];
export type Product = components['schemas']['ProductModel'];

// ── Endpoint types — POST /api/orders ──
type CreateOrderPath = paths['/api/orders']['post'];
export type CreateOrderRequest  = CreateOrderPath['requestBody']['content']['application/json'];
export type CreateOrderResponse = CreateOrderPath['responses']['201']['content']['application/json'];

// ── Endpoint types — GET /api/orders/{id} ──
type GetOrderPath = paths['/api/orders/{id}']['get'];
export type GetOrderParams   = GetOrderPath['parameters']['path'];
export type GetOrderResponse = GetOrderPath['responses']['200']['content']['application/json'];

// ── Custom types — not in the spec ──
export interface OrderErrorResponse {
  error: string;
  statusCode?: number;
  message?: string;
  details?: Record<string, string[]>;
}
```

### Section rules

| Section | Source | Use when |
|---------|--------|----------|
| Schema types | `components['schemas']` | Domain entities / DTOs |
| Endpoint types | `paths[...][method]` | Request/response per endpoint |
| Custom types | Plain `interface` | Error shapes, test helpers, anything not in the spec |

Use a private helper `type XPath = paths[...][method]` so request/response/params extractions stay readable.

### Import map

| Type origin | Location | Import from |
|-------------|----------|-------------|
| OpenAPI schema | `api/schemas/{domain}.types.ts` | `@schemas/{domain}.types` |
| OpenAPI endpoint | `api/schemas/{domain}.types.ts` | `@schemas/{domain}.types` |
| Not in spec, domain-specific | `api/schemas/{domain}.types.ts` § Custom | `@schemas/{domain}.types` |
| Cross-domain shorthand | — | `@schemas` (barrel) |
| Test data shapes (DataFactory) | `tests/data/types.ts` | `@data/types` |

```typescript
// inside an Api component
import type { LoginPayload, TokenResponse } from '@schemas/auth.types';

// inside a cross-domain test file
import type { LoginPayload } from '@schemas/auth.types';
import type { Order } from '@schemas/orders.types';
// or via the barrel
import type { LoginPayload, Order } from '@schemas';
```

### Creating a new facade

1. Copy `api/schemas/example.types.ts` to `api/schemas/{domain}.types.ts`.
2. Replace placeholder schema names with real ones from `api/openapi-types.ts`.
3. Add `export type * from './{domain}.types'` to `api/schemas/index.ts`.
4. Import from `@schemas/{domain}.types` in the component.

### Type navigation (reading the generated file)

The generated `openapi-types.ts` exposes two top-level types: `components` (schema models) and `paths` (endpoint signatures). Navigate them as follows:

```typescript
import type { components, paths } from '@openapi';  // only in facade files

// Schema models (DTOs, entities)
type Order = components['schemas']['OrderListModel'];

// Endpoint request body
type CreateOrderBody =
  paths['/api/orders']['post']['requestBody']['content']['application/json'];

// Endpoint response body
type GetOrdersResponse =
  paths['/api/orders']['get']['responses']['200']['content']['application/json'];

// Path parameters
type OrderPathParams =
  paths['/api/orders/{id}']['get']['parameters']['path'];

// Query parameters (when the spec defines them)
type OrderQueryParams =
  paths['/api/orders']['get']['parameters']['query'];
```

Use these patterns inside facade files only. Components never drill into `paths` or `components` directly.

### OpenAPI integration best practices

1. **Sync before writing tests** — run `bun run api:sync` to get the latest types before any automation session touching new endpoints.
2. **Commit `openapi-types.ts`** — the generated types file is committed so CI and other team members have them without running the backend.
3. **One facade per domain** — matches the API component it serves (`auth.types.ts` serves `AuthApi.ts`, `orders.types.ts` serves `OrdersApi.ts`).
4. **Only facades import `@openapi`** — components never import directly from the generated file.
5. **Re-export via barrel** — every facade must be re-exported from `api/schemas/index.ts` for cross-domain imports.

---

## 5. Status-code matrix — one ATC per expected outcome

Every HTTP outcome is a separate ATC because the expected status AND the response shape differ. Same status + different payload family = one parameterised ATC.

| Outcome | Status | ATC name pattern | Response type |
|---------|--------|------------------|---------------|
| Created | 201 | `create{Resource}Successfully` | `{Resource}Response` |
| OK (read) | 200 | `get{Resource}Successfully` | `{Resource}Response` or `{Resource}ListResponse` |
| OK (update) | 200 | `update{Resource}Successfully` | `{Resource}Response` |
| No Content / OK (delete) | 204 or 200 | `delete{Resource}Successfully` | `void` |
| Validation error | 400 | `create{Resource}WithInvalid{Field}` | `ApiErrorResponse` |
| Unauthenticated | 401 | `get{Resources}Unauthorized` | `ApiErrorResponse` |
| Forbidden | 403 | `delete{Resource}Forbidden` | `ApiErrorResponse` |
| Not found | 404 | `get{Resource}WithNonExistentId` / `get{Resource}NotFound` | `ApiErrorResponse` |
| Conflict | 409 | `create{Resource}WithDuplicate{Field}` | `ApiErrorResponse` |

### Success — 201 Created

```typescript
@atc('TICKET-ID')
async createOrderSuccessfully(
  payload: CreateOrderRequest,
): Promise<[APIResponse, CreateOrderResponse, CreateOrderRequest]> {
  const [response, body, sent] = await this.apiPOST<CreateOrderResponse, CreateOrderRequest>(
    this.baseEndpoint, payload,
  );
  expect(response.status()).toBe(201);
  expect(body.id).toBeDefined();
  expect(body.customerId).toBe(payload.customerId);
  return [response, body, sent];
}
```

### Success — 200 OK (list with pagination)

```typescript
@atc('TICKET-ID')
async getAllOrdersSuccessfully(
  params?: { page?: number; limit?: number },
): Promise<[APIResponse, OrderListResponse]> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  const endpoint = qs.toString() ? `${this.baseEndpoint}?${qs}` : this.baseEndpoint;

  const [response, body] = await this.apiGET<OrderListResponse>(endpoint);
  expect(response.status()).toBe(200);
  expect(Array.isArray(body.data)).toBe(true);
  expect(body.pagination).toBeDefined();
  expect(body.pagination.page).toBeGreaterThanOrEqual(1);
  return [response, body];
}
```

### Delete — accept 200 or 204

```typescript
@atc('TICKET-ID')
async deleteOrderSuccessfully(id: string): Promise<[APIResponse, void]> {
  const [response] = await this.apiDELETE(`${this.baseEndpoint}/${id}`);
  expect([200, 204]).toContain(response.status());
  return [response, undefined];
}
```

### Error — 400 Validation

```typescript
@atc('TICKET-ID')
async createOrderWithInvalidPayload(
  payload: Partial<CreateOrderRequest>,
): Promise<[APIResponse, OrderErrorResponse, Partial<CreateOrderRequest>]> {
  const [response, body] = await this.apiPOST<OrderErrorResponse, Partial<CreateOrderRequest>>(
    this.baseEndpoint, payload,
  );
  expect(response.status()).toBe(400);
  expect(body.error).toBeDefined();
  return [response, body, payload];
}
```

### Error — 401 Unauthorized (explicitly without auth)

```typescript
@atc('TICKET-ID')
async getOrdersUnauthorized(): Promise<[APIResponse, OrderErrorResponse]> {
  // Call api.clearAuthToken() in the test before calling this ATC
  const [response, body] = await this.apiGET<OrderErrorResponse>(this.baseEndpoint);
  expect(response.status()).toBe(401);
  expect(body.error).toBeDefined();
  return [response, body];
}
```

### Error — 404 Not Found

```typescript
@atc('TICKET-ID')
async getOrderWithNonExistentId(id: string): Promise<[APIResponse, OrderErrorResponse]> {
  const [response, body] = await this.apiGET<OrderErrorResponse>(`${this.baseEndpoint}/${id}`);
  expect(response.status()).toBe(404);
  expect(body.error).toBeDefined();
  return [response, body];
}
```

Equivalence partitioning applies: three ATCs that all return 401 for different invalid logins collapse into one parameterised `loginWithInvalidCredentials(payload)`. See `kata-architecture.md` §6 Rule 3.

---

## 6. Authentication & token lifecycle

### Automatic token propagation

A successful `loginSuccessfully` stores the token on `ApiBase`. Subsequent calls carry `Authorization: Bearer ...` automatically.

```typescript
test('TICKET-ID: should make authenticated call', async ({ api }) => {
  await api.auth.signInSuccessfully({ email, password });       // stores token
  const [, orders] = await api.orders.getOrdersSuccessfully({ customerId: 123 });
});
```

### Manual token management

```typescript
api.setAuthToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');   // set manually
api.clearAuthToken();                                           // drop before 401 test
```

### ApiFixture propagation pattern

When a new component is added to `ApiFixture`, auth mutators must forward to it so `setAuthToken` / `clearAuthToken` affect every registered component.

```typescript
export class ApiFixture extends ApiBase {
  readonly auth: AuthApi;
  readonly orders: OrdersApi;

  constructor(options: TestContextOptions) {
    super(options);
    this.auth = new AuthApi(options);
    this.orders = new OrdersApi(options);
  }

  override setRequestContext(request: APIRequestContext) {
    super.setRequestContext(request);
    this.auth.setRequestContext(request);
    this.orders.setRequestContext(request);
  }
  override setAuthToken(token: string) {
    super.setAuthToken(token);
    this.auth.setAuthToken(token);
    this.orders.setAuthToken(token);
  }
  override clearAuthToken() {
    super.clearAuthToken();
    this.auth.clearAuthToken();
    this.orders.clearAuthToken();
  }
}
```

Forgetting to wire a new component into `setAuthToken` is the most common cause of surprise 401s in API suites.

---

## 7. Custom error shape

When the OpenAPI spec under-specifies errors (common), define a local `ApiErrorResponse` in the domain facade's Custom-types section.

```typescript
export interface ApiErrorResponse {
  error: string;
  message?: string;
  statusCode: number;
  details?: Record<string, string[]>;
}
```

Error ATCs parameterise the response type as `ApiErrorResponse` (not the success response) so the caller gets the right autocomplete:

```typescript
const [response, body] = await this.apiGET<ApiErrorResponse>(`${this.baseEndpoint}/${id}`);
```

---

## 8. Integration test file template

```typescript
import { test, expect } from '@TestFixture';
import type { CreateOrderRequest } from '@schemas/orders.types';

test.describe('TICKET-ID: Orders API', () => {
  let customer: CustomerCandidate | null;

  test.beforeAll(async ({ api }) => {
    // DISCOVER (see test-data-management.md) — no assertions
    await api.auth.signInSuccessfully({ email, password });
    customer = await api.customers.findAvailableCustomer();
  });

  test('TICKET-ID: should create order successfully @critical', async ({ api }) => {
    if (!customer) return test.skip(true, 'No available customer');

    const payload = api.data.createOrder({ customerId: customer.id });

    const [response, body, sent] = await api.orders.createOrderSuccessfully(payload);

    // Test-level assertions beyond the fixed ones in the ATC
    expect(body.customerId).toBe(sent.customerId);
    expect(body.status).toBe('pending');
  });

  test('TICKET-ID: should reject order with invalid payload', async ({ api }) => {
    if (!customer) return test.skip(true, 'No available customer');

    const invalid = api.data.createOrder({ customerId: customer.id, quantity: -1 });
    const [, error] = await api.orders.createOrderWithInvalidPayload(invalid);
    expect(error.error).toBeDefined();
  });

  test('TICKET-ID: should return 401 without auth', async ({ api }) => {
    api.clearAuthToken();
    await api.orders.getOrdersUnauthorized();
  });
});
```

Rules applied above (all mandatory):

- `{ api }` fixture for API-only tests — no browser opens.
- Ticket ID prefix on describe and test.
- `beforeAll` discovers state without assertions; each test guards with `test.skip()`.
- `api.data.*` generates data; never hardcoded.
- Type imports come from `@schemas/orders.types`, never from `@openapi`.
- Auth-dependent tests clear the token before running.

---

## 9. Chaining ATCs at the test level

ATCs are atomic. The test orchestrates them — one ATC never calls another.

```typescript
test('TICKET-ID: should create order and appear in list', async ({ api }) => {
  await api.auth.signInSuccessfully({ email, password });
  const [, order] = await api.orders.createOrderSuccessfully(orderData);
  const [, list] = await api.orders.getAllOrdersSuccessfully({ page: 1, limit: 50 });
  expect(list.data.some(o => o.id === order.id)).toBe(true);
});
```

For preconditions repeated across 3+ tests in 3+ files, extract into a `Steps` module — not into an ATC that calls another ATC. See `kata-architecture.md` §8.

---

## 10. Running API tests

```bash
# All integration tests
bun run test:integration

# One file
bun run test tests/integration/auth/authenticateUser.test.ts

# By tag
bun run test --grep @smoke
bun run test --grep @critical

# Debug
bun run test:integration --debug

# Allure report
bun run test:allure

# Regenerate types from a fresh OpenAPI spec (run before writing new API ATCs)
bun run api:sync
```

---

## 11. Allure attachments

`ApiBase` attaches the full request/response pair to the Allure report on every HTTP call. No manual attachment needed. Masking of `password` / `token` / `secret` parameters happens in the `@atc` / `@step` decorators. Keep those parameter names canonical so masking works out of the box.

---

## 12. Troubleshooting — OpenAPI sync

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `Connection refused` during `api:sync` | Backend not running | Start backend on the URL in `api/.openapi-config.json` (or pass `--url`) |
| Types not regenerating | Invalid `openapi.json` | Validate JSON; delete `api/openapi.json`; re-run sync |
| Import error for `@api/*` or `@schemas/*` | Missing path alias | Check `tsconfig.json` `paths`; see `typescript-patterns.md` |
| Type mismatch between spec and runtime | Stale generated file | `bun run api:sync` to re-pull and regenerate |
| Missing endpoint in facade | Forgot step 3 when adding a domain | Re-export in `api/schemas/index.ts` |

---

## 13. Implementation checklist (API coding phase)

Before leaving the coding phase:

- [ ] Component extends `ApiBase`, constructor takes `TestContextOptions` and calls `super`.
- [ ] `baseEndpoint` constant at the top of the class.
- [ ] Helpers (`@step`) above ATCs (`@atc`).
- [ ] Types imported from `@schemas/{domain}.types`; no direct `@openapi` imports in the component.
- [ ] Tuple returns: 2-tuple for GET/DELETE, 3-tuple for POST/PUT/PATCH.
- [ ] Every ATC contains at least one status-code assertion plus one shape assertion.
- [ ] Error ATCs use `ApiErrorResponse` as the body type, not the success response.
- [ ] Max 2 positional parameters; 3+ collapse to an object param.
- [ ] `ApiFixture` registered the new component AND forwarded `setRequestContext` / `setAuthToken` / `clearAuthToken`.
- [ ] Test file under `tests/integration/{module}/`, name follows `{verb}{Resource}.test.ts`.
- [ ] `test` imported from `@TestFixture`.
- [ ] Ticket ID prefix in describe/test.
- [ ] Data via `api.data.*`, never hardcoded.
- [ ] 401 tests call `api.clearAuthToken()` first.
- [ ] `bun run api:sync` executed if new endpoints were added.
- [ ] `bun run test <file>` / `bun run type-check` / `bun run lint` all clean.
