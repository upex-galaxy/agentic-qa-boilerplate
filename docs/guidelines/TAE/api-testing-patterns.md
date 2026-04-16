# API Testing Patterns (Integration Level)

> How to write API/Integration tests using the KATA (Component Action Test Architecture).

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
│   │ ApiFixture│────▶│  API Components (AuthApi, OrdersApi, etc.)    │ │
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
│   └── orders/
│       └── orders.test.ts     # Orders API tests
│
├── components/
│   ├── TestContext.ts           # Layer 1: Config, Faker, Environment
│   ├── ApiFixture.ts            # Layer 4: DI container for all API components
│   └── api/
│       ├── ApiBase.ts           # Layer 2: HTTP methods (GET, POST, PUT, etc.)
│       ├── AuthApi.ts           # Layer 3: Auth ATCs
│       └── OrdersApi.ts       # Layer 3: Orders ATCs
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
│  → Exposes all API components: api.auth, api.orders, etc.             │
└────────────────────────┬────────────────────────────────────────────────┘
                         │ instantiates
                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  API Components (tests/components/api/*.ts)                              │
│  → AuthApi, OrdersApi, InvoicesApi, etc.                               │
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

> **Note**: `TK-XXX` in examples represents the actual issue ID from your tracker (Jira, Xray, etc.). Replace with the real ticket ID (e.g., `TK-101`, `UPEX-456`).

```typescript
// tests/integration/auth/auth.test.ts
import { expect, test } from '@TestFixture';

test.describe('Auth API', () => {
  test('TK-XXX: should login with valid credentials', async ({ api }) => {
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

  test('TK-XXX: should reject invalid credentials', async ({ api }) => {
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
// tests/components/api/OrdersApi.ts
import type { Order, CreateOrderRequest } from '@schemas/orders.types';
import type { APIResponse } from '@playwright/test';

import { ApiBase } from '@api/ApiBase';
import { expect } from '@playwright/test';
import { atc } from '@utils/decorators';

// ============================================
// API Component
// ============================================

export class OrdersApi extends ApiBase {
  // ============================================
  // ATCs - Complete Test Cases
  // ============================================

  @atc('TK-201')
  async getOrdersSuccessfully(customerId: number): Promise<[APIResponse, Order[]]> {
    const [response, body] = await this.apiGET<Order[]>(`/orders?customerId=${customerId}`);

    // Fixed assertions
    expect(response.status()).toBe(200);
    expect(Array.isArray(body)).toBe(true);

    return [response, body];
  }

  @atc('TK-202')
  async createOrderSuccessfully(
    payload: CreateOrderRequest
  ): Promise<[APIResponse, Order, CreateOrderRequest]> {
    const [response, body, sentPayload] = await this.apiPOST<Order, CreateOrderRequest>(
      '/orders',
      payload
    );

    // Fixed assertions
    expect(response.status()).toBe(201);
    expect(body.id).toBeDefined();

    return [response, body, sentPayload];
  }

  @atc('TK-203')
  async getOrderNotFound(orderId: number): Promise<[APIResponse, Record<string, unknown>]> {
    const [response, body] = await this.apiGET<Record<string, unknown>>(`/orders/${orderId}`);

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
import { OrdersApi } from '@api/OrdersApi'; // Import new component

export class ApiFixture extends ApiBase {
  readonly auth: AuthApi;
  readonly orders: OrdersApi; // Add new component

  constructor(environment?: Environment) {
    super(environment);
    this.auth = new AuthApi(environment);
    this.orders = new OrdersApi(environment); // Initialize
  }

  override setRequestContext(request: APIRequestContext) {
    super.setRequestContext(request);
    this.auth.setRequestContext(request);
    this.orders.setRequestContext(request); // Propagate
  }

  override setAuthToken(token: string) {
    super.setAuthToken(token);
    this.auth.setAuthToken(token);
    this.orders.setAuthToken(token); // Propagate
  }

  override clearAuthToken() {
    super.clearAuthToken();
    this.auth.clearAuthToken();
    this.orders.clearAuthToken(); // Propagate
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
test('TK-XXX: should make authenticated API call', async ({ api }) => {
  // Login first - token is automatically stored
  await api.auth.loginSuccessfully({
    username: 'admin@example.com',
    password: 'AdminPass123!',
  });

  // Subsequent calls include Authorization header automatically
  const [response, orders] = await api.orders.getOrdersSuccessfully(123);
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

After running `bun run api:sync`, types are available through **type facades** in `api/schemas/`:

```typescript
// Import from domain facade — NOT directly from @openapi
import type { Order, CreateOrderRequest, CreateOrderResponse } from '@schemas/orders.types';

// Use in ATCs
@atc('TK-201')
async createOrderSuccessfully(
  payload: CreateOrderRequest
): Promise<[APIResponse, CreateOrderResponse, CreateOrderRequest]> {
  const [response, body, sentPayload] = await this.apiPOST<CreateOrderResponse, CreateOrderRequest>(
    '/orders',
    payload,
  );
  expect(response.status()).toBe(201);
  return [response, body, sentPayload];
}

@atc('TK-202')
async getOrdersSuccessfully(customerId: number): Promise<[APIResponse, Order[]]> {
  const [response, body] = await this.apiGET<Order[]>(`/orders?customerId=${customerId}`);
  expect(response.status()).toBe(200);
  return [response, body];
}
```

> **Type Facade Pattern:** Domain types live in `api/schemas/{domain}.types.ts`.
> Components import from `@schemas/{domain}.types`, never directly from `@openapi`.
> See: `openapi-integration.md` → Type Facade Pattern for full details.

---

## ATC Naming Conventions

| Scenario               | Pattern                      | Example                        |
| ---------------------- | ---------------------------- | ------------------------------ |
| Success (200/201)      | `{action}Successfully`       | `getOrdersSuccessfully`      |
| Validation error (400) | `{action}WithInvalid{Field}` | `createOrderWithInvalidData` |
| Unauthorized (401)     | `{action}Unauthorized`       | `getOrdersUnauthorized`      |
| Not found (404)        | `{action}NotFound`           | `getOrderNotFound`           |
| Forbidden (403)        | `{action}Forbidden`          | `deleteOrderForbidden`       |

### Examples

```typescript
// Success scenarios
@atc('TK-201') async getOrdersSuccessfully(...) { ... }
@atc('TK-202') async createOrderSuccessfully(...) { ... }
@atc('TK-203') async updateOrderSuccessfully(...) { ... }

// Error scenarios
@atc('TK-204') async getOrderNotFound(...) { ... }
@atc('TK-205') async createOrderWithInvalidData(...) { ... }
@atc('TK-206') async deleteOrderForbidden(...) { ... }
@atc('TK-207') async getOrdersUnauthorized(...) { ... }
```

---

## Fixed Assertions in ATCs

Every ATC must include **fixed assertions** that validate the expected behavior:

```typescript
@atc('TK-201')
async createOrderSuccessfully(payload: CreateOrderRequest): Promise<[APIResponse, Order, CreateOrderRequest]> {
  const [response, body, sentPayload] = await this.apiPOST<Order, CreateOrderRequest>(
    '/orders',
    payload,
  );

  // Fixed assertions - ALWAYS validate these
  expect(response.status()).toBe(201);           // Expected status
  expect(body.id).toBeDefined();                  // Required field
  expect(body.customerId).toBe(payload.customerId);    // Business rule

  return [response, body, sentPayload];
}
```

### Test-Level Assertions (Optional)

Additional assertions can be added in test files for flow validation:

```typescript
test('TK-XXX: should complete order flow', async ({ api }) => {
  const payload = { customerId: 123, customerEmail: 'test@example.com', productId: 42, quantity: 1 };

  // ATC has fixed assertions
  const [, order, sentPayload] = await api.orders.createOrderSuccessfully(payload);

  // Additional test-level assertions
  expect(order.customerEmail).toBe(sentPayload.customerEmail);
  expect(order.status).toBe('pending');
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
@atc('TK-101')
async loginSuccessfully(credentials: LoginPayload) { ... }

// ❌ WRONG - Multiple ATCs for same outcome
@atc('TK-101')
async loginWithEmail(email: string) { ... }

@atc('TK-102')
async loginWithUsername(username: string) { ... }
```

### 2. Use Test Data Generation

```typescript
test('TK-XXX: should create order with generated data', async ({ api }) => {
  const payload = {
    customerEmail: api.generateEmail('order-test'),
    customerName: api.generateName(),
    referenceNumber: api.faker.string.alphanumeric(10),
  };

  await api.orders.createOrderSuccessfully(payload);
});
```

### 3. Chain ATCs for Complex Flows

```typescript
test('TK-XXX: should complete order flow end to end', async ({ api }) => {
  // Login first
  await api.auth.loginSuccessfully(credentials);

  // Create order
  const [, order] = await api.orders.createOrderSuccessfully(orderData);

  // Verify order appears in list
  const [, orders] = await api.orders.getOrdersSuccessfully(customerId);
  expect(orders.some(b => b.id === order.id)).toBe(true);
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
