# Automation Integration Test

> Implement API Integration test automation following KATA architecture.

---

## Purpose

Create API Integration automated tests for validated scenarios using the KATA framework.

**This prompt is executed AFTER:**

- Test documented in Jira/Xray (Stage 3)
- Test marked as "automation-candidate"
- Framework setup complete (kata-framework-setup.md)

**Prerequisites:**

- KATA framework configured in project
- API documentation available (OpenAPI preferred)
- Test case documented in Jira/Xray

---

## CRITICAL: Read KATA Guidelines First

**Before implementing ANY automation, read:**

```
MANDATORY READING (in order):
1. .context/guidelines/TAE/KATA-AI-GUIDE.md       # Quick orientation
2. .context/guidelines/TAE/automation-standards.md # Rules and patterns
3. .context/guidelines/TAE/openapi-integration.md     # API testing specifics
```

**Key KATA principles for API testing:**

- Use `ApiBase` methods: `apiGET`, `apiPOST`, `apiPUT`, `apiPATCH`, `apiDELETE`
- Return tuples: `[APIResponse, TBody]` or `[APIResponse, TBody, TPayload]`
- Type-safe generics for request/response
- Fixed assertions validate status codes and response structure

---

## Input Required

Provide ONE of the following:

1. **Xray Test ID** - `TEST-XXX` to fetch test case details
2. **Test case content** - API endpoint and expected behavior
3. **OpenAPI operation** - Operation ID from OpenAPI spec

**Also specify:**

- Target API component (existing or new)
- Authentication requirements

---

## Workflow

### Phase 1: Understand the API Test

**Read the test case and identify:**

```
Extract:
├── HTTP Method (GET, POST, PUT, DELETE)
├── Endpoint path
├── Request payload structure
├── Response structure
├── Expected status code
├── Authentication requirements
└── Validation rules
```

**Check OpenAPI spec (if available):**

```bash
# Location
api/openapi.yaml

# Or sync from backend
bun run api:sync
```

---

### Phase 2: Architecture Decision

**Determine what to create/modify:**

```
Questions:
1. Does the API component exist? (e.g., UsersApi.ts)
   └── YES → Add new ATC to existing component
   └── NO  → Create new component

2. Does auth component exist? (AuthApi.ts)
   └── YES → Reuse for authenticated requests
   └── NO  → Create auth component first

3. Are TypeScript types available?
   └── YES → Import from @api/types
   └── NO  → Define interfaces in component
```

**Output plan to user:**

```markdown
## Implementation Plan

**Files to CREATE:**

- tests/components/api/OrdersApi.ts
  └── ATC: createOrderSuccessfully
  └── ATC: createOrderWithInvalidData

**Files to MODIFY:**

- tests/components/ApiFixture.ts
  └── Add: readonly orders: OrdersApi

**Test file:**

- tests/integration/orders/orders.test.ts
```

---

### Phase 3: Define Types

**Define request/response interfaces:**

```typescript
// In the component file or import from @api/types

export interface CreateOrderPayload {
  productId: string;
  quantity: number;
  shippingAddress: {
    street: string;
    city: string;
    zipCode: string;
  };
}

export interface OrderResponse {
  id: string;
  status: 'pending' | 'confirmed' | 'shipped';
  total: number;
  createdAt: string;
}

export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
}
```

---

### Phase 4: Implement ATC

**Follow KATA template for API components:**

```typescript
/**
 * KATA Framework - Layer 3: Orders API Component
 */
import { expect, type APIResponse } from '@playwright/test';
import { ApiBase } from '@api/ApiBase';
import { atc } from '@utils/decorators';
import type { Environment } from '@variables';

// Types (or import from @api/types)
export interface CreateOrderPayload { ... }
export interface OrderResponse { ... }

export class OrdersApi extends ApiBase {
  constructor(environment?: Environment) {
    super(environment);
  }

  /**
   * Create order with valid data.
   * Returns: [APIResponse, OrderResponse, CreateOrderPayload]
   */
  @atc('TEST-XXX')  // Map to Xray Test ID
  async createOrderSuccessfully(
    payload: CreateOrderPayload
  ): Promise<[APIResponse, OrderResponse, CreateOrderPayload]> {
    const [response, body, sentPayload] = await this.apiPOST<
      OrderResponse,
      CreateOrderPayload
    >(
      '/orders',
      payload,
    );

    // Fixed assertions - validate ATC succeeded
    expect(response.status()).toBe(201);
    expect(body.id).toBeDefined();
    expect(body.status).toBe('pending');

    return [response, body, sentPayload];
  }

  /**
   * Create order with invalid data (negative test).
   * Returns: [APIResponse, ErrorResponse, CreateOrderPayload]
   */
  @atc('TEST-YYY')
  async createOrderWithInvalidData(
    payload: CreateOrderPayload
  ): Promise<[APIResponse, ErrorResponse, CreateOrderPayload]> {
    const [response, body, sentPayload] = await this.apiPOST<
      ErrorResponse,
      CreateOrderPayload
    >(
      '/orders',
      payload,
    );

    // Fixed assertions - expect 400 error
    expect(response.status()).toBe(400);
    expect(body.error).toBeDefined();

    return [response, body, sentPayload];
  }
}
```

---

### Phase 5: Implement Test File

```typescript
import { test, expect } from '@TestFixture';

test.describe('Orders API', () => {
  test.beforeEach(async ({ api }) => {
    // Authenticate before API tests
    await api.auth.signInSuccessfully({
      email: process.env.TEST_USER_EMAIL!,
      password: process.env.TEST_USER_PASSWORD!,
    });
  });

  test('should create order successfully @critical', async ({ api }) => {
    // ARRANGE - Test data
    const orderData = api.generateOrderData();  // Use TestContext helper

    // ACT - Use ATC
    const [response, order, payload] = await api.orders.createOrderSuccessfully(orderData);

    // ASSERT - Additional test-level assertions
    expect(order.total).toBeGreaterThan(0);
  });

  test('should reject order with invalid quantity @high', async ({ api }) => {
    // ARRANGE - Invalid data
    const invalidData = {
      productId: 'valid-id',
      quantity: -1,  // Invalid
      shippingAddress: { ... },
    };

    // ACT - Use negative ATC
    const [response, error] = await api.orders.createOrderWithInvalidData(invalidData);

    // ASSERT
    expect(error.message).toContain('quantity');
  });
});
```

---

### Phase 6: Register Component

**Add to ApiFixture.ts:**

```typescript
import { OrdersApi } from '@api/OrdersApi';

export class ApiFixture extends TestContext {
  readonly auth: AuthApi;
  readonly orders: OrdersApi; // Add

  constructor(environment?: Environment) {
    super(environment);
    this.auth = new AuthApi(environment);
    this.orders = new OrdersApi(environment); // Initialize
  }
}
```

---

### Phase 7: Validate

**Run the test:**

```bash
bun run test tests/integration/orders/orders.test.ts
```

**KATA Compliance Checklist:**

- [ ] ATC has `@atc('TEST-XXX')` decorator
- [ ] Returns tuple: `[APIResponse, TBody, TPayload]`
- [ ] Type-safe generics used
- [ ] Fixed assertions validate status code
- [ ] Fixed assertions validate response structure
- [ ] Uses import aliases (`@components/`, `@utils/`)
- [ ] Component registered in ApiFixture
- [ ] Test uses `{ api }` fixture

---

### Phase 8: Update Xray

**Mark test as automated:**

```
Update in Xray:
- Test Status: "Automated"
- Add label: "automated"
- Add comment: "Automated in TEST-XXX - [file path]"
```

---

## API Testing Patterns

### GET Request

```typescript
@atc('TEST-001')
async getUserSuccessfully(id: string): Promise<[APIResponse, UserResponse]> {
  const [response, body] = await this.apiGET<UserResponse>(`/users/${id}`);

  expect(response.status()).toBe(200);
  expect(body.id).toBe(id);

  return [response, body];
}
```

### POST Request

```typescript
@atc('TEST-002')
async createUserSuccessfully(
  payload: CreateUserPayload
): Promise<[APIResponse, UserResponse, CreateUserPayload]> {
  const [response, body, sentPayload] = await this.apiPOST<UserResponse, CreateUserPayload>(
    '/users',
    payload,
  );

  expect(response.status()).toBe(201);
  expect(body.id).toBeDefined();

  return [response, body, sentPayload];
}
```

### PUT/PATCH Request

```typescript
@atc('TEST-003')
async updateUserSuccessfully(
  id: string,
  payload: UpdateUserPayload
): Promise<[APIResponse, UserResponse, UpdateUserPayload]> {
  const [response, body, sentPayload] = await this.apiPUT<UserResponse, UpdateUserPayload>(
    `/users/${id}`,
    payload,
  );

  expect(response.status()).toBe(200);

  return [response, body, sentPayload];
}
```

### DELETE Request

```typescript
@atc('TEST-004')
async deleteUserSuccessfully(id: string): Promise<[APIResponse, void]> {
  const [response] = await this.apiDELETE<void>(`/users/${id}`);

  expect(response.status()).toBe(204);

  return [response, undefined as void];
}
```

---

## Output

- ATC implemented following KATA standards
- Test file created/updated
- Component registered in ApiFixture
- Test passing locally
- Xray test marked as automated
