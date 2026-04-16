# Test Data Management

Strategy and mechanics for supplying test data in a KATA project. Load when designing preconditions, writing `beforeAll` / `beforeEach` hooks, building `DataFactory` generators, adding fixture JSON, or deciding how a new test should obtain its data.

Architectural rules (no shared state, credentials from `.env`, one generator per test) are stated once in `automation-standards.md` and are not repeated here. This reference covers strategy, placement, and mechanics.

---

## 1. Golden Rule

Never hardcode test data. Every test obtains its data at runtime — by discovering, modifying, or generating it. Hardcoded IDs, emails, or timestamps break the first time the environment changes.

**Exception** — login credentials for pre-existing users come from `.env` (`LOCAL_USER_EMAIL`, `STAGING_USER_EMAIL`, and matching passwords). Everything else is dynamic.

---

## 2. Strategy — Discover → Modify → Generate

Every precondition data need resolves to one of three patterns. Classify during the planning phase, not during coding.

| Priority | Pattern | What it does | When to pick it |
|----------|---------|-------------|-----------------|
| 1 | **Discover** | Query the system (API or DB) for an entity already in the required state | Entity already exists in the environment in the desired state. Default. |
| 2 | **Modify** | Find existing data, then mutate it via API into the required state | Entity exists but not in the right state, API supports the mutation |
| 3 | **Generate** | Create new data from scratch via API (or DB fallback) | No usable data exists, full CRUD is available, or the test mutates state |

Discover is preferred — zero impact on the database, realistic data. Modify adds one mutation. Generate is the last resort because it pollutes the environment.

### Override — when Generate beats Discover

Use Generate even if data could be discovered when the test **mutates** state (POST, PUT, DELETE). Sharing a discovered entity across mutating tests creates order dependencies. Pair with `beforeEach` for isolation.

### Feasibility check (during planning)

Before accepting a TC as an automation candidate, answer in order:

1. Can the entity be **discovered** reliably? (query DB or GET endpoint)
2. If not, can existing data be **modified** to reach the required state? (PUT/PATCH endpoint available?)
3. If not, can data be **created from scratch** via POST?
4. If none of the above → flag as blocker. The test is not yet an automation candidate; escalate to backend/infra.

This check belongs in the Implementation Plan (Data Discovery step), never during coding.

### Decision flowchart

```
Need data for entity X?
  ├─ Exists in required state? ──── YES → Discover
  ├─ Exists but wrong state?   ──── YES → Modify
  ├─ Can be created via API?   ──── YES → Generate
  └─ None of the above?        ──── BLOCKER (raise)
```

---

## 3. DataFactory — central generator

Single static class at `tests/data/DataFactory.ts`. Propagated through `TestContext` so both API and UI components reach it as `this.data`.

### Access patterns

```typescript
// From a Layer 3 component (extends TestContext via base)
const user = this.data.createUser();

// From a test file via fixture
const user = ui.data.createUser();
const order = api.data.createOrder({ quantity: 2 });

// Direct import when no context is available
import { DataFactory } from '@DataFactory';
DataFactory.createUser();
```

### Seeded generators (baseline)

| Method | Returns | Purpose |
|--------|---------|---------|
| `createUser(overrides?)` | `TestUser` | Full user payload (email, password, name, first/last) |
| `createCredentials(overrides?)` | `TestCredentials` | Email + password only (for login) |
| `createTestId(prefix?)` | `string` | Unique identifier for tagging/tracing |
| `createProduct(overrides?)` | `TestProduct` | Product domain payload |
| `createOrder(overrides?)` | `TestOrder` | Order domain payload |

Types live in `tests/data/types.ts`:

```typescript
interface TestUser { email: string; password: string; name: string; firstName?: string; lastName?: string; }
interface TestCredentials { email: string; password: string; }
interface TestProduct { name: string; sku?: string; price?: number; categoryId?: number; }
interface TestOrder { referenceNumber: string; productId: number; quantity: number; totalAmount: number; createdAt: string; }
```

### Extending DataFactory

Add a method in `DataFactory.ts` and a matching interface in `types.ts`. Generator rules:

- Every field uses `faker` or a deterministic random helper. No hardcoded values except domain enums.
- Accept `overrides?: Partial<T>` as the last positional arg. Spread it after defaults so callers win.
- Use prefixes that identify test-origin data: `test.`, `CONF-`, `ORD-`. Makes DB cleanup and log inspection trivial.

```typescript
static createCategory(overrides?: Partial<TestCategory>): TestCategory {
  return {
    name: `Category ${faker.commerce.department()} ${faker.number.int({ min: 1, max: 999 })}`,
    parentId: faker.number.int({ min: 1, max: 1000 }),
    createdAt: faker.date.recent().toISOString(),
    productCount: faker.number.int({ min: 0, max: 500 }),
    ...overrides,
  };
}
```

### Never import `faker` directly in tests or components

Always go through DataFactory. Direct `faker` imports bypass type contracts and spread random-data logic across the codebase.

---

## 4. Usage patterns

### Full object

```typescript
const user = this.data.createUser();
// → { email: 'test.john.x7k2m9@example.com', password: 'TestAb3kL9mN!', name: 'John Doe', ... }
```

### With overrides

```typescript
const admin = this.data.createUser({ email: 'admin@example.com', name: 'Admin User' });
```

### Credentials only

```typescript
const creds = this.data.createCredentials();
await ui.login.loginWithValidCredentials(creds);
```

### Traceable ID

```typescript
const testId = this.data.createTestId('order');
// → 'order-1707312000000-x7k2m9'
```

---

## 5. DataFactory in components and tests

### Inside an ATC

```typescript
@atc('ORDER-API-001')
async createOrderSuccessfully(overrides?: Partial<TestOrder>) {
  const order = this.data.createOrder(overrides);
  const [response, body, sent] = await this.apiPOST<OrderResponse, TestOrder>('/orders', order);
  expect(response.status()).toBe(201);
  return [response, body, sent];
}
```

### Inside a UI ATC

```typescript
@atc('REG-UI-001')
async registerNewUser(overrides?: Partial<TestUser>): Promise<TestUser> {
  const user = this.data.createUser(overrides);
  await this.page.locator('[data-testid="email"]').fill(user.email);
  await this.page.locator('[data-testid="password"]').fill(user.password);
  await this.page.locator('[data-testid="name"]').fill(user.name);
  await this.page.locator('[data-testid="submit"]').click();
  await expect(this.page).toHaveURL(/.*dashboard.*/);
  return user;
}
```

### Inside a test

```typescript
test('TICKET-ID: should register user with custom email', async ({ ui }) => {
  const user = ui.data.createUser({ email: 'vip@example.com' });
  await ui.registration.registerNewUser(user);
});
```

---

## 6. Precondition placement — `beforeAll` vs `beforeEach`

Where you put the setup determines test speed AND test isolation. Pick by asking "does the test mutate the data?"

| Hook | Pick when | Why |
|------|-----------|-----|
| `beforeAll` | Data is **read-only** — tests observe but never mutate | Query runs once, not N times. Fast. |
| `beforeAll` | Setup is **expensive and shared** (login, heavy seeding) | Avoid repeating costly calls |
| `beforeEach` | Data is **mutated** by each test (POST, PUT, DELETE) | Each test needs a fresh isolated state |
| `beforeEach` | Setup is **cheap and must stay isolated** (page navigation) | Ensures independence even if one test fails |

Rule of thumb: test **reads** → `beforeAll`. Test **writes** → `beforeEach`.

### Passing data from setup to tests

Declare variables at the `describe` scope. `beforeAll` populates them without assertions; each test validates its own precondition with `test.skip()`.

```typescript
test.describe('Orders: page states', () => {
  let completedOrder: OrderCandidate | null;
  let pendingOrder: OrderCandidate | null;

  test.beforeAll(async ({ api }) => {
    // DISCOVER — no assertions here
    completedOrder = await api.orders.findOrderWithState('completed');
    pendingOrder = await api.orders.findOrderWithState('pending');
  });

  test('TICKET-ID: should show details for completed order', async ({ ui }) => {
    if (!completedOrder) return test.skip(true, 'No completed order available');
    await ui.orders.selectOrder({ orderId: completedOrder.id });
  });

  test('TICKET-ID: should show pending state', async ({ ui }) => {
    if (!pendingOrder) return test.skip(true, 'No pending order available');
    await ui.orders.selectOrder({ orderId: pendingOrder.id });
  });
});
```

---

## 7. Never `expect` inside `beforeAll`

If a `beforeAll` assertion fails, ALL tests in the describe block fail — including unrelated ones. That hides what really broke.

```typescript
// WRONG — one missing precondition kills every test in the block
test.beforeAll(async ({ api }) => {
  pendingOrder = await api.orders.findByState('pending');
  expect(pendingOrder, 'No pending order').toBeDefined();   // blocks unrelated tests
});

// WRONG — cryptic null access in the test
test('should display pending', async ({ ui }) => {
  await ui.orders.selectOrder(pendingOrder.id);  // TypeError: Cannot read 'id' of null
});

// RIGHT — beforeAll discovers only, each test skips with a message
test.beforeAll(async ({ api }) => {
  pendingOrder = await api.orders.findByState('pending');
});

test('TICKET-ID: should display pending', async ({ ui }) => {
  if (!pendingOrder) return test.skip(true, 'No pending order available');
  await ui.orders.selectOrder(pendingOrder.id);
});
```

Why:

- `beforeAll` is shared setup — it must not contain assertions that block unrelated tests.
- Each test validates its own precondition with `test.skip(true, reason)`.
- The report distinguishes "skipped — missing data" from "failed — actual bug".

---

## 8. Cleanup — `afterAll` and `afterEach`

If setup **modifies** or **generates** data, restore or delete it so the environment does not accumulate residue.

| Hook | When to use |
|------|-------------|
| `afterEach` | Each test mutated data independently — restore after each |
| `afterAll` | One shared mutation in `beforeAll` — restore once at end |

```typescript
test.describe('TICKET-ID: Order status actions', () => {
  let originalStatus: string;

  test.beforeAll(async ({ api }) => {
    const [, order] = await api.orders.getStatus(orderId);
    originalStatus = order.status;
    await api.orders.resetToProcessing(orderId);
  });

  test.afterAll(async ({ api }) => {
    await api.orders.setStatus(orderId, originalStatus);
  });
});
```

| Pattern used in setup | Cleanup required |
|-----------------------|------------------|
| Discover | None — data was only read |
| Modify | Restore original state in `afterAll` / `afterEach` |
| Generate | Delete created entity in `afterEach` (or accept the leak if the env is disposable) |

---

## 9. Placement summary

| Data strategy | Hook | Variable scope | Cleanup |
|---------------|------|----------------|---------|
| Discover | `beforeAll` (query once) | describe scope | None |
| Modify | `beforeAll` or `beforeEach` | describe scope | `afterAll` / `afterEach` to restore |
| Generate | `beforeEach` (isolated per test) | describe scope or inline | `afterEach` to delete (if env needs it) |

---

## 10. Static fixture files

For reference data that does not change — roles, permission matrices, mock response bodies, configuration trees — use `tests/data/fixtures/` JSON (or CSV if tabular).

| Fixtures (`tests/data/fixtures/`) | DataFactory |
|-----------------------------------|-------------|
| Fixed roles / permissions | Test users |
| Reference catalogs | Transactional data |
| API mock responses | Request payloads |
| Configuration trees | Domain objects with business logic |

### JSON example

```json
// tests/data/fixtures/roles.json
{
  "admin": { "name": "Administrator", "permissions": ["read", "write", "delete", "admin"] },
  "catalog_manager": { "name": "Catalog Manager", "permissions": ["read", "write", "publish"] },
  "viewer": { "name": "Viewer", "permissions": ["read"] }
}
```

### Usage

```typescript
import roles from '@data/fixtures/roles.json';

test('TICKET-ID: admin can delete', async ({ api }) => {
  const user = api.data.createUser();
  await api.users.assignRole(user.id, roles.admin);
});
```

### Parameterised tests from JSON

```typescript
import usersData from '@data/fixtures/users.json';

for (const user of usersData) {
  test(`TICKET-ID: should signup ${user.type} user`, async ({ ui }) => {
    await ui.signup.signupWithValidCredentials({ email: user.email, password: user.password });
  });
}
```

Commit `tests/data/fixtures/` and `tests/data/uploads/`. Gitignore `tests/data/downloads/` and `test-results/`.

---

## 11. Isolation & parallelism

Workers run in parallel (`playwright.config.ts: workers: 4` or similar). DataFactory guarantees uniqueness by combining a prefix, an epoch-ms timestamp, and a 6-char random suffix:

```
Email:   test.john.x7k2m9@example.com
TestId:  order-1707312000000-x7k2m9
```

That is enough to avoid collisions across workers AND across retries. Do not design tests that rely on sequential data (e.g., "the first order in the DB"); always tag with a unique marker first.

For stabilization rules (no hardcoded waits, no retries, specific-condition waiting), see `automation-standards.md` §7.

---

## 12. Credentials & sensitive data

Credentials for pre-existing users come from environment variables. Never hardcode. Never check into git.

```typescript
// config/variables.ts
export const config = {
  testUser: {
    email: process.env.LOCAL_USER_EMAIL!,
    password: process.env.LOCAL_USER_PASSWORD!,
  },
};

// usage
const { email, password } = api.config.testUser;
await api.auth.loginSuccessfully({ email, password });
```

`.env` keys by environment:

```
LOCAL_USER_EMAIL=test@example.com
LOCAL_USER_PASSWORD=SecurePassword123!
STAGING_USER_EMAIL=staging@example.com
STAGING_USER_PASSWORD=StagingPassword123!
```

Decorators (`@atc`, `@step`) automatically mask parameters named `password`, `token`, `secret` in trace output. Keep the names canonical so masking works.

---

## 13. DO / DON'T

### DO

- Use `this.data.createX()` inside components, `ui.data.createX()` / `api.data.createX()` in tests.
- Classify data as Discover / Modify / Generate during planning.
- Declare describe-scope variables and let `beforeAll` populate them.
- Guard every test that depends on discovered data with `test.skip()`.
- Give generated entities identifiable prefixes (`test.`, `CONF-`, `ORD-`).
- Clean up modified data in `afterAll`; delete generated data in `afterEach` when the env matters.

### DON'T

- Hardcode emails, IDs, reference numbers, or dates.
- Put `expect` inside `beforeAll`.
- Share generated data between tests.
- Import `faker` directly — go through DataFactory.
- Use production data.
- Create generators without matching TypeScript interfaces.
- Mutate data discovered by another test without restoring it.

---

## 14. Quick reference

```typescript
// From components
this.data.createUser();
this.data.createCredentials();
this.data.createTestId('prefix');
this.data.createProduct();
this.data.createOrder();

// From tests
ui.data.createUser();
api.data.createOrder({ productId: 42, quantity: 2 });

// Direct
import { DataFactory } from '@DataFactory';
DataFactory.createUser();

// With overrides
this.data.createOrder({ totalAmount: 500 });
```

File shapes:

```
tests/data/DataFactory.ts        # generators
tests/data/types.ts              # TestUser, TestOrder, TestCategory, ...
tests/data/fixtures/*.json       # reference data (committed)
tests/data/uploads/*             # upload inputs (committed)
tests/data/downloads/*           # download destination (gitignored)
```
