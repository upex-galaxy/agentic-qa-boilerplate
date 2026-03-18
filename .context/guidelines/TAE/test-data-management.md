# Test Data Management

Guide for test data management in KATA framework with TypeScript + Playwright.

---

## 1. Philosophy

### Golden Rule

**NEVER use static data** (except login credentials). Always generate dynamic data with Faker.

### Principles

| Principle         | Description                                    |
| ----------------- | ---------------------------------------------- |
| **Dynamic**       | Data generated at runtime, not hardcoded       |
| **Isolation**     | Each test creates its own data                 |
| **Uniqueness**    | UUIDs/timestamps to prevent conflicts          |
| **Realism**       | Data that simulates production scenarios       |
| **Traceability**  | Identifiable prefixes for cleanup              |

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

## 4. Usage Patterns

### 4.1 Complete Object

```typescript
// Generates all fields with Faker
const user = this.data.createUser();
// → { email: 'test.john.x7k2m9@example.com', password: 'TestAb3kL9mN!', name: 'John Doe', ... }
```

### 4.2 With Overrides

```typescript
// Generates everything but overrides specific fields
const admin = this.data.createUser({
  email: 'admin@example.com',
  name: 'Admin User',
});
// → { email: 'admin@example.com', password: 'TestAb3kL9mN!', name: 'Admin User', ... }
```

### 4.3 Credentials Only

```typescript
// When you only need email + password
const creds = this.data.createCredentials();
await this.loginPage.login(creds.email, creds.password);
```

### 4.4 ID for Tracking

```typescript
// Generates unique ID to identify test data
const testId = this.data.createTestId('booking');
// → 'booking-1707312000000-x7k2m9'
```

---

## 5. Usage in Components

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

## 6. Usage in Tests

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

## 7. Extending DataFactory

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

## 8. Static Fixtures

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

## 9. Data Isolation

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

## 10. Credentials and Sensitive Data

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

## 11. Best Practices

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

## 12. Quick Reference

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

## 13. Resources

- **Faker Documentation**: https://fakerjs.dev/
- **Playwright Test Fixtures**: https://playwright.dev/docs/test-fixtures
- **Test Data Patterns**: https://martinfowler.com/bliki/TestDataBuilder.html
