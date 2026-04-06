# Test Data Management

Guide for test data management in KATA framework with TypeScript + Playwright.

---

## 1. Philosophy

### Golden Rule

**NEVER hardcode test data.** Tests must obtain their data dynamically at runtime — whether by creating it, discovering it, or modifying existing data.

### Test Data Strategy (Priority Order)

Every test needs data. Before writing any test code, determine HOW the test will get its data using this priority hierarchy:

| Priority | Pattern | What It Does | When to Use | Example |
|----------|---------|-------------|-------------|---------|
| **1. Discover** | Query the system to find existing data that matches preconditions | Finds a real entity already in the desired state | When the entity already exists in the required state (most common) | Query DB for an account with `status = 'active'` |
| **2. Modify** | Find existing data and alter it via API to match preconditions | Adjusts an entity to reach the required state | When the entity exists but isn't in the right state, and the API supports the mutation | Find an account, then PUT to update its status |
| **3. Generate** | Create data from scratch via API/DB | Produces a clean, isolated data state | Last resort — when no usable data exists and the system supports full CRUD | POST /orders to create an order, then test it |

**Priority 1 (Discover) is always preferred** because it has zero impact on the database and uses real, production-like data. Use Pattern 2 when data exists but needs adjustment, and Pattern 3 only when nothing usable exists.

**Exception**: When the test **mutates** data (POST/PUT/DELETE that changes state), Generate may be preferred to avoid contaminating shared data. Use `beforeEach` for these cases to ensure isolation per test.

**Important**: All three patterns happen at **runtime** in precondition steps (`beforeAll`, `beforeEach`, or test setup). Never assume specific data exists in the environment — always verify or create it.

### Feasibility Check (During Planning)

**Before a test is an automation candidate**, validate which data pattern is feasible:

1. Can existing data be **discovered** reliably? → Query DB/API for entities in the required state
2. Can existing data be **modified** to reach the required state? → Check available mutation endpoints
3. Can the data be **created** from scratch via API? → Check available POST/PUT endpoints
4. **If none of the above is possible** → The test is NOT an automation candidate (flag as blocker)

This check should happen during the **planning phase** (`test-implementation-plan.md` Step 4: Data Discovery), not during coding. Discovering a data feasibility issue while coding wastes time.

### Principles

| Principle         | Description                                    |
| ----------------- | ---------------------------------------------- |
| **Dynamic**       | Data obtained at runtime, never hardcoded      |
| **Isolation**     | Each test creates or discovers its own data    |
| **Uniqueness**    | UUIDs/timestamps to prevent conflicts          |
| **Realism**       | Data that simulates production scenarios       |
| **Traceability**  | Identifiable prefixes for cleanup              |
| **Resilience**    | Tests don't break when environment data changes |

---

## 2. Architecture

### DataFactory

Centralized static class in `tests/data/DataFactory.ts`.

```
tests/data/
├── DataFactory.ts      # Centralized generator
├── types.ts            # Internal types
├── fixtures/           # Static reference data
│   └── example.json
├── uploads/            # Files for upload tests
└── downloads/          # Destination for downloaded files
```

### Access

DataFactory propagates through TestContext:

```typescript
// From components (inherit from TestContext)
const user = this.data.createUser();

// From tests (via fixtures)
const user = ui.data.createUser();
const user = api.data.createUser();

// Direct import (when no context available)
import { DataFactory } from '@DataFactory';
const user = DataFactory.createUser();
```

---

## 3. DataFactory API

### Available Methods

| Method                          | Returns           | Description                                |
| ------------------------------- | ----------------- | ------------------------------------------ |
| `createUser(overrides?)`        | `TestUser`        | Complete user with email, password, name   |
| `createCredentials(overrides?)` | `TestCredentials` | Only email + password                      |
| `createTestId(prefix?)`         | `string`          | Unique ID for tracking                     |
| `createProduct(overrides?)`     | `TestProduct`     | Product data (example)                     |
| `createOrder(overrides?)`       | `TestOrder`       | Order data (example)                       |

### Types

```typescript
// tests/data/types.ts

interface TestUser {
  email: string;
  password: string;
  name: string;
  firstName?: string;
  lastName?: string;
}

interface TestCredentials {
  email: string;
  password: string;
}

interface TestHotel {
  name: string;
  organizationId?: number;
  invoiceCap?: number;
}

interface TestBooking {
  confirmationNumber: string;
  hotelId: number;
  stayValue: number;
  checkInDate: string;
  emailHash?: string;
}
```

---

## 4. Data Patterns: Discover, Modify, Generate

### 4.1 Pattern 1: Discover (Preferred)

Query the system (API or DB) to find existing data that matches the test's preconditions. The test adapts to whatever data exists rather than assuming specific IDs or names. This is the preferred approach because it has zero impact on the database and uses real, production-like data.

```typescript
// In beforeAll: discover an entity in the required state
let testProduct: { id: number; name: string } | null;

test.beforeAll(async ({ api }) => {
  // DISCOVER: Query API/DB for a product in the required state
  const candidates = await api.products.getAvailableProducts();
  testProduct = candidates[0] ?? null;
});

test('TK-XXX: should display product details', async ({ ui }) => {
  if (!testProduct) return test.skip(true, 'No available product found');

  // Test uses dynamically discovered data
  await ui.products.selectProductById({
    productId: testProduct.id,
    name: testProduct.name,
  });
});
```

**Use when**: The entity already exists in the required state in the environment (most common case).

**Important**: Use the `test.skip()` guard pattern instead of `expect` in `beforeAll`. If no data matches, the test skips with a clear message — not a cryptic error. See Section 5.3 for the full pattern.

### 4.2 Pattern 2: Modify (When Discovery Alone Is Not Enough)

Find existing data and alter it via API to reach the required state. This is a combination of discovery + mutation.

```typescript
test.beforeAll(async ({ api }) => {
  // DISCOVER: Find an order
  const [, orders] = await api.orders.getOrders();
  const order = orders[0];

  // MODIFY: Change its state via API to match preconditions
  await api.orders.resetToProcessing(order.id);
  // Now order is in "processing" state
});
```

**Use when**: Data exists but isn't in the right state, and the API supports the required mutation.

**Cleanup**: If you modify data, consider restoring it in `afterAll` to avoid polluting the environment for other tests.

### 4.3 Pattern 3: Generate (Last Resort)

Create data from scratch using DataFactory + API calls. This gives full control over the data state but has the most impact on the database.

```typescript
// In test setup or beforeAll
test('TK-XXX: should create order successfully', async ({ api }) => {
  // GENERATE: Create fresh data via API
  const orderData = api.data.createOrder({ productId: 42, quantity: 2 });
  const [, order] = await api.orders.createOrderSuccessfully(orderData);

  // Test uses the freshly created data
  expect(order.id).toBeDefined();
});
```

**Use when**: No usable data exists in the environment and the system supports full CRUD for the entity. Also preferred when the test **mutates** the data (POST/PUT/DELETE) and needs a fresh, isolated state per test — use `beforeEach` for these cases.

### 4.4 Decision Flowchart

```
Need test data for entity X?
  │
  ├─ Does X already exist in the required state?
  │   └─ YES → Pattern 1: Discover (preferred)
  │
  ├─ Can existing X be modified to reach the required state?
  │   └─ YES → Pattern 2: Modify
  │
  ├─ Can X be created from scratch via API?
  │   └─ YES → Pattern 3: Generate (last resort)
  │
  └─ None of the above?
      └─ Flag as BLOCKER — test is not an automation candidate
```

---

## 5. Precondition Placement Strategy

Once you know HOW to get data (Discover, Modify, or Generate), you need to decide WHERE to place the precondition code and how to pass the data to tests.

### 5.1 beforeAll vs beforeEach

| Use | When | Reason | Example |
|-----|------|--------|---------|
| `beforeAll` | Data is **read-only** — tests observe but don't mutate | Query runs once, not N times. Faster. | Discover an entity with specific state → all tests in the suite use it |
| `beforeEach` | Data is **mutated** by each test (POST, PUT, DELETE) | Each test needs a fresh, isolated state | Create an order → test updates it → next test needs its own order |
| `beforeAll` | Setup is **expensive** and shared (login, heavy API calls) | Avoids repeating costly setup per test | Authenticate once → reuse token for all tests |
| `beforeEach` | Setup is **cheap** and must be **isolated** | Ensures test independence even if one test fails | Navigate to a page before each test |

**Rule of thumb**: If the test **reads** data → `beforeAll`. If the test **writes** data → `beforeEach`.

### 5.2 Passing Data from Setup to Tests

Declare variables at the `describe` scope. `beforeAll` discovers the data (no assertions), and **each test validates its own precondition** with `test.skip()`.

```typescript
test.describe('Order Dashboard: Page States', () => {
  // Declare at describe scope — accessible by beforeAll AND all tests
  let completedOrder: OrderCandidate | null;
  let pendingOrder: OrderCandidate | null;

  test.beforeAll(async ({ api }) => {
    // DISCOVER ONLY — no assertions here
    completedOrder = await api.orders.findOrderWithState('completed');
    pendingOrder = await api.orders.findOrderWithState('pending');
  });

  test('should display details when order is completed', async ({ ui }) => {
    if (!completedOrder) return test.skip(true, 'No completed order found');

    await ui.orders.selectOrder({
      orderId: completedOrder.id,
      status: completedOrder.status,
    });
  });

  test('should display pending state when order is processing', async ({ ui }) => {
    if (!pendingOrder) return test.skip(true, 'No pending order found');

    await ui.orders.selectOrder({
      orderId: pendingOrder.id,
      status: pendingOrder.status,
    });
  });
});
```

### 5.3 Precondition Validation Pattern

**CRITICAL: Never use `expect` in `beforeAll` for precondition data.** If a `beforeAll` assertion fails, ALL tests in the describe block fail — even tests that don't need that specific data.

```typescript
// ❌ WRONG — expect in beforeAll kills ALL tests if one precondition is missing
test.beforeAll(async ({ api }) => {
  pendingOrder = await api.orders.findByState('pending');
  completedOrder = await api.orders.findByState('completed');

  expect(pendingOrder, 'No pending order found').toBeDefined();   // If this fails →
  expect(completedOrder, 'No completed order found').toBeDefined(); // ALL tests fail
});

// ❌ WRONG — cryptic error if data is null
test('should display pending state', async ({ ui }) => {
  await ui.orders.selectOrder(pendingOrder.id); // TypeError: Cannot read 'id' of null
});

// ✅ CORRECT — beforeAll discovers, each test uses guard clause to skip
test.beforeAll(async ({ api }) => {
  // Discovery only — NO assertions
  pendingOrder = await api.orders.findByState('pending');
  completedOrder = await api.orders.findByState('completed');
});

test('should display pending state', async ({ ui }) => {
  if (!pendingOrder) return test.skip(true, 'No pending order found');

  await ui.orders.selectOrder(pendingOrder.id); // Safe: TypeScript narrowed
});

test('should display completed details', async ({ ui }) => {
  if (!completedOrder) return test.skip(true, 'No completed order found');

  await ui.orders.selectOrder(completedOrder.id); // Runs independently
});
```

**Why this matters:**
- `beforeAll` is for **shared setup** — discovery, login, navigation
- `beforeAll` must NEVER contain assertions that could block unrelated tests
- Each test is **responsible for its own preconditions** via `test.skip()`
- The test report shows exactly which tests were skipped and why (not a blanket "beforeAll failed")
- Skipped tests signal "environment data issue", not "code bug" — important distinction

### 5.4 Cleanup with afterAll / afterEach

If the setup **modifies** data (Pattern 2: Modify), restore the original state to avoid polluting the environment.

| Hook | When to Use |
|------|------------|
| `afterEach` | Each test modified data independently → restore after each |
| `afterAll` | One shared modification in beforeAll → restore once at end |

```typescript
test.describe('Order Status Actions', () => {
  let originalStatus: string;

  test.beforeAll(async ({ api }) => {
    // Save original state
    const [, order] = await api.orders.getStatus(orderId);
    originalStatus = order.status;

    // MODIFY: Set to required state
    await api.orders.resetToProcessing(orderId);
  });

  test.afterAll(async ({ api }) => {
    // CLEANUP: Restore original state
    await api.orders.setStatus(orderId, originalStatus);
  });

  // ... tests ...
});
```

**If Pattern 1 (Discover) was used**: no cleanup needed (data was only read).
**If Pattern 2 (Modify) was used**: cleanup means restoring the original state.
**If Pattern 3 (Generate) was used**: cleanup means deleting the created data.

### 5.5 Summary Table

| Data Pattern | Placement | Variables | Cleanup |
|-------------|-----------|-----------|---------|
| Discover (find existing) | `beforeAll` (query once) | Describe scope | None needed |
| Modify (alter existing) | `beforeAll` or `beforeEach` | Describe scope | `afterAll` / `afterEach` to restore |
| Generate (create fresh) | `beforeEach` (isolated per test) | Describe scope or inline | `afterEach` to delete |

---

## 6. Usage Patterns (DataFactory)

### 6.1 Complete Object

```typescript
// Generates all fields with Faker
const user = this.data.createUser();
// → { email: 'test.john.x7k2m9@example.com', password: 'TestAb3kL9mN!', name: 'John Doe', ... }
```

### 6.2 With Overrides

```typescript
// Generates everything but overrides specific fields
const admin = this.data.createUser({
  email: 'admin@example.com',
  name: 'Admin User',
});
// → { email: 'admin@example.com', password: 'TestAb3kL9mN!', name: 'Admin User', ... }
```

### 6.3 Credentials Only

```typescript
// When you only need email + password
const creds = this.data.createCredentials();
await this.loginPage.login(creds.email, creds.password);
```

### 6.4 ID for Tracking

```typescript
// Generates unique ID to identify test data
const testId = this.data.createTestId('booking');
// → 'booking-1707312000000-x7k2m9'
```

---

## 7. Usage in Components

### In ATCs (Layer 3)

```typescript
// tests/components/api/BookingsApi.ts
import { ApiBase } from './ApiBase';

export class BookingsApi extends ApiBase {
  @atc('BOOK-API-001')
  async createBookingSuccessfully(overrides?: Partial<TestBooking>) {
    // Generate dynamic data
    const booking = this.data.createBooking(overrides);

    const response = await this.post('/api/bookings', { data: booking });
    expect(response.status()).toBe(201);

    return [response, await response.json(), booking] as const;
  }
}
```

### In UI Components

```typescript
// tests/components/ui/RegistrationPage.ts
import { UiBase } from './UiBase';

export class RegistrationPage extends UiBase {
  @atc('REG-UI-001')
  async registerNewUser(overrides?: Partial<TestUser>) {
    const user = this.data.createUser(overrides);

    await this.page.fill('[data-testid="email"]', user.email);
    await this.page.fill('[data-testid="password"]', user.password);
    await this.page.fill('[data-testid="name"]', user.name);
    await this.page.click('[data-testid="submit"]');

    await expect(this.page).toHaveURL(/.*dashboard.*/);
    return user;
  }
}
```

---

## 8. Usage in Tests

### E2E Tests

```typescript
// tests/e2e/registration/registration.test.ts
import { test, expect } from '@TestFixture';

test.describe('User Registration', () => {
  test('TK-XXX: should register new user successfully', async ({ ui }) => {
    // ARRANGE - DataFactory generates dynamic data
    const user = ui.data.createUser();

    // ACT - ATC uses the data
    await ui.registration.registerNewUser(user);

    // ASSERT
    await expect(ui.page.locator('[data-testid="welcome"]')).toContainText(user.name);
  });

  test('TK-XXX: should register user with specific email', async ({ ui }) => {
    // Specific override for this test
    const user = ui.data.createUser({
      email: 'vip@example.com',
    });

    await ui.registration.registerNewUser(user);
  });
});
```

### Integration Tests

```typescript
// tests/integration/bookings/bookings.test.ts
import { test, expect } from '@TestFixture';

test.describe('Bookings API', () => {
  test('TK-XXX: should create booking with generated data', async ({ api }) => {
    // ARRANGE
    const booking = api.data.createBooking({
      hotelId: 123, // Specific hotel
      stayValue: 500, // Fixed value for validation
    });

    // ACT
    const [response, body] = await api.bookings.createBookingSuccessfully(booking);

    // ASSERT
    expect(body.stayValue).toBe(500);
    expect(body.confirmationNumber).toMatch(/^CONF-[A-Z0-9]{8}$/);
  });
});
```

---

## 9. Extending DataFactory

### Adding New Generators

```typescript
// tests/data/DataFactory.ts

export class DataFactory {
  // ... existing methods ...

  /**
   * Generates Newsletter data for testing
   */
  static createNewsletter(overrides?: Partial<TestNewsletter>): TestNewsletter {
    return {
      name: `Newsletter ${faker.date.month()} ${faker.date.year()}`,
      hotelId: faker.number.int({ min: 1, max: 1000 }),
      sentDate: faker.date.recent().toISOString(),
      recipientCount: faker.number.int({ min: 100, max: 10000 }),
      ...overrides,
    };
  }
}
```

### Adding New Types

```typescript
// tests/data/types.ts

export interface TestNewsletter {
  name: string;
  hotelId: number;
  sentDate: string;
  recipientCount: number;
}
```

---

## 10. Static Fixtures

For reference data that doesn't change, use `tests/data/fixtures/`.

### When to Use Fixtures

| Use Fixtures For         | Use DataFactory For          |
| ------------------------ | ---------------------------- |
| Fixed roles/permissions  | Test users                   |
| Reference catalogs       | Transactional data           |
| API mock responses       | Request payloads             |
| Configurations           | Data with business logic     |

### Fixture Example

```json
// tests/data/fixtures/roles.json
{
  "admin": {
    "name": "Administrator",
    "permissions": ["read", "write", "delete", "admin"]
  },
  "hotel_manager": {
    "name": "Hotel Manager",
    "permissions": ["read", "write", "reconcile"]
  },
  "viewer": {
    "name": "Viewer",
    "permissions": ["read"]
  }
}
```

### Using Fixtures

```typescript
import roles from '@data/fixtures/roles.json';

test('admin can delete', async ({ api }) => {
  const user = api.data.createUser();
  // Use fixed role from fixture
  await api.users.assignRole(user.id, roles.admin);
});
```

---

## 11. Data Isolation

### Unique Identifiers

DataFactory automatically generates unique identifiers:

```typescript
// Unique email: test.john.x7k2m9@example.com
// Pattern: {prefix}.{name}.{6-chars-random}@example.com

// Unique TestId: test-1707312000000-x7k2m9
// Pattern: {prefix}-{timestamp}-{6-chars-random}
```

### Parallel Execution

For parallel tests, generated data is automatically unique by timestamp + random string.

```typescript
// playwright.config.ts
export default defineConfig({
  workers: 4, // 4 tests in parallel
});

// Each worker generates unique data automatically
// No collisions thanks to timestamp + random
```

---

## 12. Credentials and Sensitive Data

### Login Credentials

**Exception to the rule**: Credentials for existing users come from environment variables.

```typescript
// config/variables.ts
export const config = {
  testUser: {
    email: process.env.LOCAL_USER_EMAIL!,
    password: process.env.LOCAL_USER_PASSWORD!,
  },
};

// Usage in tests
const { email, password } = api.config.testUser;
await api.auth.loginSuccessfully({ email, password });
```

### Environment Variables

```env
# .env (do not commit)
LOCAL_USER_EMAIL=test@example.com
LOCAL_USER_PASSWORD=SecurePassword123!
STAGING_USER_EMAIL=staging@example.com
STAGING_USER_PASSWORD=StagingPassword123!
```

---

## 13. Best Practices

### DO

- Use `this.data.createX()` in components
- Use `ui.data.createX()` or `api.data.createX()` in tests
- Pass overrides only when necessary
- Generate new data for each test
- Use identifiable prefixes (`test.`, `CONF-`)

### DON'T

- Hardcode emails, names, or values
- Share data between tests
- Use production data in tests
- Create generators without TypeScript types
- Import faker directly (use DataFactory)

---

## 14. Quick Reference

```typescript
// Access from components
this.data.createUser();
this.data.createCredentials();
this.data.createTestId('prefix');
this.data.createHotel();
this.data.createBooking();

// Access from tests
ui.data.createUser();
api.data.createUser();

// Direct import
import { DataFactory } from '@DataFactory';
DataFactory.createUser();

// With overrides
this.data.createUser({ email: 'fixed@test.com' });
this.data.createBooking({ hotelId: 123, stayValue: 500 });
```

---

## 15. Resources

- **Faker Documentation**: https://fakerjs.dev/
- **Playwright Test Fixtures**: https://playwright.dev/docs/test-fixtures
- **Test Data Patterns**: https://martinfowler.com/bliki/TestDataBuilder.html
