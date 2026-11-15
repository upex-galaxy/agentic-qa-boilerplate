# Test Data Management

How a KATA test obtains its data: strategy, placement and mechanics. Load it when you design preconditions, write `beforeAll` / `beforeEach` hooks, build `DataFactory` generators, add fixture JSON, or decide where a new test gets its data.

The architectural rules (no shared state, credentials from `.env`, one generator per test) live in `automation-standards.md` and are not repeated here.

---

## 1. Golden rule

Every test obtains its data at runtime, by discovering, modifying or generating it. Hardcoded IDs, emails and timestamps break the first time the environment changes.

The one exception is login credentials for pre-existing users, which come from `.env` (`LOCAL_USER_EMAIL`, `STAGING_USER_EMAIL` and the matching passwords). Everything else is dynamic.

---

## 2. Strategy: Discover, Modify, Generate

Every precondition data need resolves to one of three patterns. Classify it in the planning phase, before coding.

| Priority | Pattern | What it does | When to pick it |
|----------|---------|-------------|-----------------|
| 1 | **Discover** | Query the system (API or DB) for an entity already in the required state | Entity already exists in the environment in the desired state. Default. |
| 2 | **Modify** | Find existing data, then mutate it via API into the required state | Entity exists but not in the right state, API supports the mutation |
| 3 | **Generate** | Create new data from scratch via API (or DB fallback) | No usable data exists, full CRUD is available, or the test mutates state |

Discover is preferred: it leaves the database untouched and returns realistic data. Modify adds one mutation. Generate is the last resort because it pollutes the environment.

### Override: when Generate beats Discover

When the test mutates state (POST, PUT, DELETE), use Generate even if data could be discovered. A discovered entity shared across mutating tests creates order dependencies. Pair it with `beforeEach` for isolation.

### Feasibility check (during planning)

Before accepting a TC as an automation candidate, answer in order:

1. Can the entity be **discovered** reliably? (query DB or GET endpoint)
2. If not, can existing data be **modified** to reach the required state? (PUT/PATCH endpoint available?)
3. If not, can data be **created from scratch** via POST?
4. If none of the above, flag a blocker. The test is not yet an automation candidate; escalate to backend or infra.

The check belongs in the Implementation Plan (Data Discovery step), not in coding.

### Decision flowchart

```
Need data for entity X?
  ├─ Exists in required state? ──── YES → Discover
  ├─ Exists but wrong state?   ──── YES → Modify
  ├─ Can be created via API?   ──── YES → Generate
  └─ None of the above?        ──── BLOCKER (raise)
```

---

## 3. DataFactory: central generator

One static class at `tests/data/DataFactory.ts`. `TestContext` propagates it, so API and UI components reach it as `this.data`.

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

`tests/data/DataFactory.ts` lists the baseline generators with their return types.

Types live in `tests/data/types.ts`:

```typescript
interface TestUser { email: string; password: string; name: string; firstName?: string; lastName?: string; }
interface TestCredentials { email: string; password: string; }
interface TestProduct { name: string; sku?: string; price?: number; categoryId?: number; }
interface TestOrder { referenceNumber: string; productId: number; quantity: number; totalAmount: number; createdAt: string; }
```

### Extending DataFactory

Add a method in `DataFactory.ts` and a matching interface in `types.ts`. Generator rules:

- Every field uses `faker` or a deterministic random helper. Only domain enums may be hardcoded.
- Accept `overrides?: Partial<T>` as the last positional argument and spread it after the defaults so callers win.
- Prefix test-origin data (`test.`, `CONF-`, `ORD-`) so DB cleanup and log inspection are easy.

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

### Import `faker` only inside DataFactory

Tests and components go through DataFactory. A direct `faker` import bypasses the type contracts and spreads random-data logic across the codebase.

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

## 6. Precondition placement: `beforeAll` vs `beforeEach`

Where the setup sits decides both speed and isolation. Ask whether the test mutates the data.

| Hook | Pick when | Why |
|------|-----------|-----|
| `beforeAll` | Data is read-only: tests observe but never mutate | The query runs once, not N times |
| `beforeAll` | Setup is expensive and shared (login, heavy seeding) | Avoids repeating costly calls |
| `beforeEach` | Each test mutates the data (POST, PUT, DELETE) | Each test needs a fresh isolated state |
| `beforeEach` | Setup is cheap and must stay isolated (page navigation) | Keeps tests independent even when one fails |

In short, a test that reads uses `beforeAll` and a test that writes uses `beforeEach`.

### Passing data from setup to tests

Declare variables at the `describe` scope. `beforeAll` populates them without assertions, and each test checks its own precondition with `test.skip()`.

```typescript
test.describe('Orders: page states', () => {
  let completedOrder: OrderCandidate | null;
  let pendingOrder: OrderCandidate | null;

  test.beforeAll(async ({ api }) => {
    // DISCOVER: no assertions here
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

## 7. No `expect` inside `beforeAll`

If a `beforeAll` assertion fails, every test in the describe block fails, unrelated ones included, and the report hides what really broke.

```typescript
// WRONG: one missing precondition kills every test in the block
test.beforeAll(async ({ api }) => {
  pendingOrder = await api.orders.findByState('pending');
  expect(pendingOrder, 'No pending order').toBeDefined();   // blocks unrelated tests
});

// WRONG: cryptic null access in the test
test('should display pending', async ({ ui }) => {
  await ui.orders.selectOrder(pendingOrder.id);  // TypeError: Cannot read 'id' of null
});

// RIGHT: beforeAll discovers only, each test skips with a message
test.beforeAll(async ({ api }) => {
  pendingOrder = await api.orders.findByState('pending');
});

test('TICKET-ID: should display pending', async ({ ui }) => {
  if (!pendingOrder) return test.skip(true, 'No pending order available');
  await ui.orders.selectOrder(pendingOrder.id);
});
```

Each test validates its own precondition with `test.skip(true, reason)`, so the report separates "skipped: missing data" from "failed: actual bug".

---

## 8. Cleanup: `afterAll` and `afterEach`

If setup modifies or generates data, restore or delete it so the environment does not accumulate residue.

| Hook | When to use |
|------|-------------|
| `afterEach` | Each test mutated data independently, so restore after each |
| `afterAll` | One shared mutation in `beforeAll`, so restore once at the end |

```typescript
test.describe('TICKET-ID: Validate order status actions', () => {
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
| Discover | None, the data was only read |
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

Reference data that does not change (roles, permission matrices, mock response bodies, configuration trees) goes in `tests/data/fixtures/` as JSON, or CSV when tabular.

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

Uniqueness matters even with a single worker (see `workers` in `playwright.config.ts`): it protects reruns against the same environment and the later move to parallelism. DataFactory builds it from a prefix, an epoch-ms timestamp and a 6-character random suffix:

```
Email:   test.john.x7k2m9@example.com
TestId:  order-1707312000000-x7k2m9
```

That avoids collisions across reruns and, once parallelism is on, across workers. Do not design tests around sequential data such as "the first order in the DB"; tag the data with a unique marker first.

Stabilization rules (no hardcoded waits, no retries, waiting on a specific condition) are in `automation-standards.md` §7.

---

## 12. Credentials & sensitive data

Credentials for pre-existing users come from environment variables. They are not hardcoded and not committed to git.

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

Decorators (`@atc`, `@step`) mask parameters named `password`, `token` and `secret` in trace output, so keep those names canonical.

---

## 13. Checklist

- Data comes from `this.data.createX()` inside components and `ui.data.createX()` / `api.data.createX()` in tests; `faker` stays inside DataFactory and every generator has a matching TypeScript interface.
- Each data need is classified Discover, Modify or Generate during planning, and generated entities carry a prefix (`test.`, `CONF-`, `ORD-`).
- Describe-scope variables are filled by `beforeAll` with no `expect`, and every test that depends on discovered data guards with `test.skip()`.
- Modified data is restored in `afterAll` and generated data deleted in `afterEach` when the environment matters. A test never mutates data discovered by another test without restoring it.
- No hardcoded emails, IDs, reference numbers or dates, no production data, and no generated data shared between tests.

---

## 14. Quick reference

The call forms are in §4 and §5: `this.data.createUser()`, `createCredentials()`, `createTestId('prefix')`, `createProduct()` and `createOrder()` from components; `ui.data.*` and `api.data.*` from tests; `DataFactory.createUser()` by direct import; overrides as the last argument, for example `this.data.createOrder({ totalAmount: 500 })`.

File shapes:

```
tests/data/DataFactory.ts        # generators
tests/data/types.ts              # TestUser, TestOrder, TestCategory, ...
tests/data/fixtures/*.json       # reference data (committed)
tests/data/uploads/*             # upload inputs (committed)
tests/data/downloads/*           # download destination (gitignored)
```
