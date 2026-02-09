# API Testing Patterns (Integration Level)

> How to write API/Integration tests using the KATA framework.

---

## Overview

API Testing in KATA follows the **Integration Testing** paradigm: tests that validate API endpoints without involving browser/UI interactions. These tests are faster, more reliable, and ideal for validating business logic at the service layer.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     API TESTING ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Test File (.test.ts)                                                   │
│        │                                                                 │
│        ▼                                                                 │
│   ┌───────────┐     ┌─────────────────────────────────────────────────┐ │
│   │ ApiFixture│────▶│  API Components (AuthApi, BookingsApi, etc.)    │ │
│   └───────────┘     │       │                                         │ │
│                     │       ▼                                         │ │
│                     │  ┌─────────┐   ┌──────────────────────────────┐ │ │
│                     │  │ ApiBase │──▶│ HTTP Methods (GET/POST/etc.) │ │ │
│                     │  └─────────┘   └──────────────────────────────┘ │ │
│                     │       │                                         │ │
│                     │       ▼                                         │ │
│                     │  ┌─────────────┐                                │ │
│                     │  │ TestContext │ (config, faker, environment)   │ │
│                     │  └─────────────┘                                │ │
│                     └─────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
tests/
├── integration/                  # API/Integration test files
│   ├── module-example/
│   │   └── example.test.ts      # Example tests (reference only)
│   ├── auth/
│   │   └── auth.test.ts         # Auth API tests
│   └── bookings/
│       └── bookings.test.ts     # Bookings API tests
│
├── components/
│   ├── TestContext.ts           # Layer 1: Config, Faker, Environment
│   ├── ApiFixture.ts            # Layer 4: DI container for all API components
│   └── api/
│       ├── ApiBase.ts           # Layer 2: HTTP methods (GET, POST, PUT, etc.)
│       ├── AuthApi.ts           # Layer 3: Auth ATCs
│       └── BookingsApi.ts       # Layer 3: Bookings ATCs
```

---

## Layer Architecture for API Testing

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Test File (tests/integration/auth/auth.test.ts)                        │
│  → Orchestrates ATCs, no business logic here                            │
└────────────────────────┬────────────────────────────────────────────────┘
                         │ uses { api } fixture
                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  ApiFixture (tests/components/ApiFixture.ts)                            │
│  → Dependency Injection container                                        │
│  → Exposes all API components: api.auth, api.bookings, etc.             │
└────────────────────────┬────────────────────────────────────────────────┘
                         │ instantiates
                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  API Components (tests/components/api/*.ts)                              │
│  → AuthApi, BookingsApi, InvoicesApi, etc.                               │
│  → Contains ATCs (@atc decorator) with fixed assertions                  │
└────────────────────────┬────────────────────────────────────────────────┘
                         │ extends
                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  ApiBase (tests/components/api/ApiBase.ts)                               │
│  → Type-safe HTTP methods: apiGET, apiPOST, apiPUT, apiPATCH, apiDELETE │
│  → Automatic Allure attachment                                           │
│  → Auth token management                                                 │
└────────────────────────┬────────────────────────────────────────────────┘
                         │ extends
                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  TestContext (tests/components/TestContext.ts)                           │
│  → Environment config (dev, staging, prod)                               │
│  → Faker instance for test data generation                               │
│  → Global utilities                                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Writing API Tests

### 1. Test File Structure

```typescript
// tests/integration/auth/auth.test.ts
import { expect, test } from '@TestFixture';

test.describe('Auth API', () => {
  test('should login with valid credentials', async ({ api }) => {
    // ARRANGE - Prepare test data
    const credentials = {
      username: 'test@example.com',
      password: 'ValidPassword123!',
    };

    // ACT & ASSERT - ATC handles the complete flow
    const [response, body, sentPayload] = await api.auth.loginSuccessfully(credentials);

    // Additional test-level assertions (optional)
    expect(body.access_token).toContain('eyJ'); // JWT format
  });

  test('should reject invalid credentials', async ({ api }) => {
    // ARRANGE
    const invalidCredentials = {
      username: 'fake@example.com',
      password: 'wrong',
    };

    // ACT & ASSERT
    await api.auth.loginWithInvalidCredentials(invalidCredentials);
  });
});
```

### 2. API Component Structure

```typescript
// tests/components/api/BookingsApi.ts
import type { APIResponse } from '@playwright/test';
import type { components } from '@api/openapi-types';

import { ApiBase } from '@api/ApiBase';
import { expect } from '@playwright/test';
import { atc } from '@utils/decorators';

// ============================================
// Types - Use OpenAPI generated types
// ============================================

type Booking = components['schemas']['BookingListModel'];
type BookingPayload = components['schemas']['CreateBookingRequest'];

// ============================================
// API Component
// ============================================

export class BookingsApi extends ApiBase {
  // ============================================
  // ATCs - Complete Test Cases
  // ============================================

  @atc('CUR-BOOK-001')
  async getBookingsSuccessfully(hotelId: number): Promise<[APIResponse, Booking[]]> {
    const [response, body] = await this.apiGET<Booking[]>(`/bookings?hotelId=${hotelId}`);

    // Fixed assertions
    expect(response.status()).toBe(200);
    expect(Array.isArray(body)).toBe(true);

    return [response, body];
  }

  @atc('CUR-BOOK-002')
  async createBookingSuccessfully(
    payload: BookingPayload
  ): Promise<[APIResponse, Booking, BookingPayload]> {
    const [response, body, sentPayload] = await this.apiPOST<Booking, BookingPayload>(
      '/bookings',
      payload
    );

    // Fixed assertions
    expect(response.status()).toBe(201);
    expect(body.id).toBeDefined();

    return [response, body, sentPayload];
  }

  @atc('CUR-BOOK-003')
  async getBookingNotFound(bookingId: number): Promise<[APIResponse, Record<string, unknown>]> {
    const [response, body] = await this.apiGET<Record<string, unknown>>(`/bookings/${bookingId}`);

    // Fixed assertions
    expect(response.status()).toBe(404);

    return [response, body];
  }
}
```

### 3. Register Component in ApiFixture

```typescript
// tests/components/ApiFixture.ts
import { ApiBase } from '@api/ApiBase';
import { AuthApi } from '@api/AuthApi';
import { BookingsApi } from '@api/BookingsApi'; // Import new component

export class ApiFixture extends ApiBase {
  readonly auth: AuthApi;
  readonly bookings: BookingsApi; // Add new component

  constructor(environment?: Environment) {
    super(environment);
    this.auth = new AuthApi(environment);
    this.bookings = new BookingsApi(environment); // Initialize
  }

  override setRequestContext(request: APIRequestContext) {
    super.setRequestContext(request);
    this.auth.setRequestContext(request);
    this.bookings.setRequestContext(request); // Propagate
  }

  override setAuthToken(token: string) {
    super.setAuthToken(token);
    this.auth.setAuthToken(token);
    this.bookings.setAuthToken(token); // Propagate
  }

  override clearAuthToken() {
    super.clearAuthToken();
    this.auth.clearAuthToken();
    this.bookings.clearAuthToken(); // Propagate
  }
}
```

---

## ApiBase HTTP Methods

ApiBase provides type-safe HTTP methods with automatic Allure attachment:

| Method      | Return Type                      | Use Case          |
| ----------- | -------------------------------- | ----------------- |
| `apiGET`    | `[APIResponse, TBody]`           | Read operations   |
| `apiPOST`   | `[APIResponse, TBody, TPayload]` | Create operations |
| `apiPUT`    | `[APIResponse, TBody, TPayload]` | Full update       |
| `apiPATCH`  | `[APIResponse, TBody, TPayload]` | Partial update    |
| `apiDELETE` | `[APIResponse, TBody]`           | Delete operations |

### Return Value Pattern

```typescript
// GET/DELETE return tuple of 2
const [response, body] = await this.apiGET<UserResponse>('/users/1');

// POST/PUT/PATCH return tuple of 3 (includes sent payload)
const [response, body, sentPayload] = await this.apiPOST<UserResponse, CreateUserPayload>(
  '/users',
  userData
);
```

### Request Options

```typescript
interface RequestOptions {
  headers?: Record<string, string>; // Custom headers
  params?: Record<string, string>; // Query parameters
  timeout?: number; // Request timeout (ms)
}

// Example with options
const [response, body] = await this.apiGET<SearchResults>('/search', {
  params: { q: 'test', limit: '10' },
  headers: { 'X-Custom-Header': 'value' },
  timeout: 30000,
});
```

---

## Authentication in API Tests

### Login and Store Token

```typescript
test('authenticated API call', async ({ api }) => {
  // Login first - token is automatically stored
  await api.auth.loginSuccessfully({
    username: 'admin@example.com',
    password: 'AdminPass123!',
  });

  // Subsequent calls include Authorization header automatically
  const [response, bookings] = await api.bookings.getBookingsSuccessfully(123);
});
```

### Manual Token Management

```typescript
// Set token manually (e.g., from storage)
api.setAuthToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');

// Clear token
api.clearAuthToken();
```

---

## Using OpenAPI Types

After running `bun run api:sync`, use generated types for type safety:

```typescript
import type { components, paths } from '@api/openapi-types';

// Extract schema types
type Booking = components['schemas']['BookingListModel'];
type Invoice = components['schemas']['InvoiceModel'];
type Hotel = components['schemas']['HotelModel'];

// Use in ATCs
@atc('CUR-BOOK-001')
async getBookingsSuccessfully(hotelId: number): Promise<[APIResponse, Booking[]]> {
  const [response, body] = await this.apiGET<Booking[]>(`/bookings?hotelId=${hotelId}`);
  // body is typed as Booking[]
  return [response, body];
}
```

---

## ATC Naming Conventions

| Scenario               | Pattern                      | Example                        |
| ---------------------- | ---------------------------- | ------------------------------ |
| Success (200/201)      | `{action}Successfully`       | `getBookingsSuccessfully`      |
| Validation error (400) | `{action}WithInvalid{Field}` | `createBookingWithInvalidData` |
| Unauthorized (401)     | `{action}Unauthorized`       | `getBookingsUnauthorized`      |
| Not found (404)        | `{action}NotFound`           | `getBookingNotFound`           |
| Forbidden (403)        | `{action}Forbidden`          | `deleteBookingForbidden`       |

### Examples

```typescript
// Success scenarios
@atc('CUR-BOOK-001') async getBookingsSuccessfully(...) { ... }
@atc('CUR-BOOK-002') async createBookingSuccessfully(...) { ... }
@atc('CUR-BOOK-003') async updateBookingSuccessfully(...) { ... }

// Error scenarios
@atc('CUR-BOOK-010') async getBookingNotFound(...) { ... }
@atc('CUR-BOOK-011') async createBookingWithInvalidData(...) { ... }
@atc('CUR-BOOK-012') async deleteBookingForbidden(...) { ... }
@atc('CUR-BOOK-013') async getBookingsUnauthorized(...) { ... }
```

---

## Fixed Assertions in ATCs

Every ATC must include **fixed assertions** that validate the expected behavior:

```typescript
@atc('CUR-BOOK-001')
async createBookingSuccessfully(payload: BookingPayload): Promise<[APIResponse, Booking, BookingPayload]> {
  const [response, body, sentPayload] = await this.apiPOST<Booking, BookingPayload>(
    '/bookings',
    payload,
  );

  // Fixed assertions - ALWAYS validate these
  expect(response.status()).toBe(201);           // Expected status
  expect(body.id).toBeDefined();                  // Required field
  expect(body.hotelId).toBe(payload.hotelId);    // Business rule

  return [response, body, sentPayload];
}
```

### Test-Level Assertions (Optional)

Additional assertions can be added in test files for flow validation:

```typescript
test('booking flow', async ({ api }) => {
  const payload = { hotelId: 123, guestEmail: 'test@example.com', ... };

  // ATC has fixed assertions
  const [, booking, sentPayload] = await api.bookings.createBookingSuccessfully(payload);

  // Additional test-level assertions
  expect(booking.guestEmail).toBe(sentPayload.guestEmail);
  expect(booking.status).toBe('pending');
});
```

---

## Running API Tests

```bash
# Run all integration tests
bun run test:integration

# Run specific test file
bun run test tests/integration/auth/auth.test.ts

# Run with specific tag
bun run test --grep @smoke

# Debug mode
bun run test:integration --debug
```

---

## Best Practices

### 1. One ATC per Expected Outcome

Each ATC should have a unique expected outcome. Don't create separate ATCs for the same status code:

```typescript
// ✅ CORRECT - One ATC for valid login
@atc('CUR-AUTH-001')
async loginSuccessfully(credentials: LoginPayload) { ... }

// ❌ WRONG - Multiple ATCs for same outcome
@atc('CUR-AUTH-001')
async loginWithEmail(email: string) { ... }

@atc('CUR-AUTH-002')
async loginWithUsername(username: string) { ... }
```

### 2. Use Test Data Generation

```typescript
test('create booking', async ({ api }) => {
  const payload = {
    guestEmail: api.generateEmail('booking-test'),
    guestName: api.generateName(),
    confirmationNumber: api.faker.string.alphanumeric(10),
  };

  await api.bookings.createBookingSuccessfully(payload);
});
```

### 3. Chain ATCs for Complex Flows

```typescript
test('complete booking flow', async ({ api }) => {
  // Login first
  await api.auth.loginSuccessfully(credentials);

  // Create booking
  const [, booking] = await api.bookings.createBookingSuccessfully(bookingData);

  // Verify booking appears in list
  const [, bookings] = await api.bookings.getBookingsSuccessfully(hotelId);
  expect(bookings.some(b => b.id === booking.id)).toBe(true);
});
```

### 4. Keep Tests Independent

Each test should be able to run independently without relying on state from other tests.

---

## Allure Reporting

API requests are automatically attached to Allure reports:

```typescript
// In ApiBase.ts - already implemented
await attachRequestResponseToAllure({
  url: endpoint,
  method: 'POST',
  responseBody: body,
  requestBody: data,
});
```

View reports with:

```bash
bun run test:allure
```

---

## References

- **KATA Architecture**: `.context/guidelines/TAE/kata-architecture.md`
- **Automation Standards**: `.context/guidelines/TAE/automation-standards.md`
- **OpenAPI Integration**: `.context/guidelines/TAE/openapi-integration.md`
- **TypeScript Patterns**: `.context/guidelines/TAE/typescript-patterns.md`
