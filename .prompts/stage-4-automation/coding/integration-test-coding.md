# Integration Test Coding

> **Phase**: 2 of 3 (Plan → Coding → Review)
> **Purpose**: Implement the API component and test file based on the approved plan.
> **Input**: Approved plan from Phase 1.

---

## Context Loading

**Load these files before proceeding:**

1. `.context/guidelines/TAE/kata-ai-index.md` → Core KATA patterns
2. `.context/guidelines/TAE/typescript-patterns.md` → TypeScript conventions
3. `.context/guidelines/TAE/api-testing-patterns.md` → API patterns
4. `.context/playwright-automation-system.md` → Code architecture

---

## Input Required

1. **Approved Plan** from Phase 1 (`planning/test-implementation-plan.md`)
2. **Original Test Case** (API spec from Stage 3)

---

## Implementation Workflow

### Step 1: Verify Prerequisites

Before coding, verify:

```bash
# Check if base classes exist
cat tests/components/api/ApiBase.ts

# Check fixture structure
cat tests/components/ApiFixture.ts

# Verify import aliases
grep -A 10 '"paths"' tsconfig.json

# Check existing types
cat tests/data/types.ts
```

---

### Step 2: Create Type Definitions

Add all types needed for the API component:

```typescript
// tests/data/types.ts

// ============================================================================
// {RESOURCE} TYPES
// ============================================================================

/**
 * Payload for creating a new {resource}
 * Used in POST /api/v1/{resources}
 */
export interface Create{Resource}Payload {
  name: string;
  email: string;
  roleId: number;
  metadata?: Record<string, unknown>;
}

/**
 * Payload for updating a {resource}
 * Used in PUT/PATCH /api/v1/{resources}/{id}
 */
export interface Update{Resource}Payload {
  name?: string;
  email?: string;
  roleId?: number;
}

/**
 * Response from {resource} endpoints
 */
export interface {Resource}Response {
  id: string;
  name: string;
  email: string;
  roleId: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * List response with pagination
 */
export interface {Resource}ListResponse {
  data: {Resource}Response[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Standard API error response
 */
export interface ApiErrorResponse {
  error: string;
  message?: string;
  statusCode: number;
  details?: Record<string, string[]>;
}
```

---

### Step 3: Implement API Component

Create the KATA API component following Layer 3 structure:

#### Component Template

```typescript
// tests/components/api/{Resource}Api.ts

import type { APIResponse } from '@playwright/test';
import type { TestContextOptions } from '@components/TestContext';
import { expect } from '@playwright/test';
import { ApiBase } from '@api/ApiBase';
import { atc } from '@utils/decorators';

// ============================================================================
// TYPE IMPORTS/EXPORTS
// ============================================================================

// Import types from central types file
import type {
  Create{Resource}Payload,
  Update{Resource}Payload,
  {Resource}Response,
  {Resource}ListResponse,
  ApiErrorResponse,
} from '@data/types';

// Re-export for test file convenience
export type {
  Create{Resource}Payload,
  Update{Resource}Payload,
  {Resource}Response,
};

// ============================================================================
// COMPONENT IMPLEMENTATION
// ============================================================================

/**
 * {Resource}Api - API Component for {resource} endpoints
 *
 * Layer: 3 (Domain Component)
 * Extends: ApiBase
 * Base URL: /api/v1/{resources}
 *
 * ATCs:
 * - {TEST-001}: create{Resource}Successfully() - Create new resource
 * - {TEST-002}: get{Resource}Successfully() - Get single resource
 * - {TEST-003}: update{Resource}Successfully() - Update resource
 * - {TEST-004}: delete{Resource}Successfully() - Delete resource
 * - {TEST-005}: get{Resource}WithNonExistentId() - 404 case
 */
export class {Resource}Api extends ApiBase {
  // ==========================================================================
  // CONFIGURATION
  // ==========================================================================

  /** Base endpoint for this resource */
  private readonly baseEndpoint = '/api/v1/{resources}';

  // ==========================================================================
  // CONSTRUCTOR
  // ==========================================================================

  constructor(options: TestContextOptions) {
    super(options);
  }

  // ==========================================================================
  // ATCs: SUCCESS CASES
  // ==========================================================================

  /**
   * {TEST-001}: Create a new {resource}
   *
   * POST /api/v1/{resources}
   *
   * Fixed Assertions:
   * - Status code is 201 Created
   * - Response body contains id
   * - Response echoes payload values
   *
   * @param payload - Data for creating the resource
   * @returns Tuple of [response, body, payload]
   */
  @atc('{TEST-001}')
  async create{Resource}Successfully(
    payload: Create{Resource}Payload
  ): Promise<[APIResponse, {Resource}Response, Create{Resource}Payload]> {
    // -------------------------------------------------------------------------
    // REQUEST
    // -------------------------------------------------------------------------
    const [response, body] = await this.apiPOST<{Resource}Response, Create{Resource}Payload>(
      this.baseEndpoint,
      payload
    );

    // -------------------------------------------------------------------------
    // FIXED ASSERTIONS
    // -------------------------------------------------------------------------
    expect(response.status()).toBe(201);
    expect(body.id).toBeDefined();
    expect(body.name).toBe(payload.name);
    expect(body.email).toBe(payload.email);

    return [response, body, payload];
  }

  /**
   * {TEST-002}: Get a single {resource} by ID
   *
   * GET /api/v1/{resources}/{id}
   *
   * Fixed Assertions:
   * - Status code is 200 OK
   * - Response body contains expected fields
   *
   * @param id - Resource identifier
   * @returns Tuple of [response, body]
   */
  @atc('{TEST-002}')
  async get{Resource}Successfully(
    id: string
  ): Promise<[APIResponse, {Resource}Response]> {
    // -------------------------------------------------------------------------
    // REQUEST
    // -------------------------------------------------------------------------
    const [response, body] = await this.apiGET<{Resource}Response>(
      `${this.baseEndpoint}/${id}`
    );

    // -------------------------------------------------------------------------
    // FIXED ASSERTIONS
    // -------------------------------------------------------------------------
    expect(response.status()).toBe(200);
    expect(body.id).toBe(id);
    expect(body.name).toBeDefined();
    expect(body.email).toBeDefined();

    return [response, body];
  }

  /**
   * {TEST-003}: Get all {resources} with pagination
   *
   * GET /api/v1/{resources}?page=1&limit=10
   *
   * Fixed Assertions:
   * - Status code is 200 OK
   * - Response contains data array
   * - Pagination info present
   *
   * @param params - Query parameters (page, limit)
   * @returns Tuple of [response, body]
   */
  @atc('{TEST-003}')
  async getAll{Resources}Successfully(
    params?: { page?: number; limit?: number }
  ): Promise<[APIResponse, {Resource}ListResponse]> {
    // -------------------------------------------------------------------------
    // BUILD QUERY STRING
    // -------------------------------------------------------------------------
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.limit) queryParams.set('limit', params.limit.toString());

    const endpoint = queryParams.toString()
      ? `${this.baseEndpoint}?${queryParams}`
      : this.baseEndpoint;

    // -------------------------------------------------------------------------
    // REQUEST
    // -------------------------------------------------------------------------
    const [response, body] = await this.apiGET<{Resource}ListResponse>(endpoint);

    // -------------------------------------------------------------------------
    // FIXED ASSERTIONS
    // -------------------------------------------------------------------------
    expect(response.status()).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.page).toBeGreaterThanOrEqual(1);

    return [response, body];
  }

  /**
   * {TEST-004}: Update an existing {resource}
   *
   * PUT /api/v1/{resources}/{id}
   *
   * Fixed Assertions:
   * - Status code is 200 OK
   * - Response reflects updated values
   *
   * @param id - Resource identifier
   * @param payload - Update data
   * @returns Tuple of [response, body, payload]
   */
  @atc('{TEST-004}')
  async update{Resource}Successfully(
    id: string,
    payload: Update{Resource}Payload
  ): Promise<[APIResponse, {Resource}Response, Update{Resource}Payload]> {
    // -------------------------------------------------------------------------
    // REQUEST
    // -------------------------------------------------------------------------
    const [response, body] = await this.apiPUT<{Resource}Response, Update{Resource}Payload>(
      `${this.baseEndpoint}/${id}`,
      payload
    );

    // -------------------------------------------------------------------------
    // FIXED ASSERTIONS
    // -------------------------------------------------------------------------
    expect(response.status()).toBe(200);
    expect(body.id).toBe(id);
    if (payload.name) expect(body.name).toBe(payload.name);
    if (payload.email) expect(body.email).toBe(payload.email);

    return [response, body, payload];
  }

  /**
   * {TEST-005}: Delete a {resource}
   *
   * DELETE /api/v1/{resources}/{id}
   *
   * Fixed Assertions:
   * - Status code is 204 No Content OR 200 OK
   *
   * @param id - Resource identifier
   * @returns Tuple of [response, void]
   */
  @atc('{TEST-005}')
  async delete{Resource}Successfully(
    id: string
  ): Promise<[APIResponse, void]> {
    // -------------------------------------------------------------------------
    // REQUEST
    // -------------------------------------------------------------------------
    const [response] = await this.apiDELETE(`${this.baseEndpoint}/${id}`);

    // -------------------------------------------------------------------------
    // FIXED ASSERTIONS
    // -------------------------------------------------------------------------
    expect([200, 204]).toContain(response.status());

    return [response, undefined];
  }

  // ==========================================================================
  // ATCs: ERROR CASES
  // ==========================================================================

  /**
   * {TEST-006}: Attempt to get non-existent {resource}
   *
   * GET /api/v1/{resources}/{non-existent-id}
   *
   * Fixed Assertions:
   * - Status code is 404 Not Found
   * - Error message present
   *
   * @param id - Non-existent resource ID
   * @returns Tuple of [response, errorBody]
   */
  @atc('{TEST-006}')
  async get{Resource}WithNonExistentId(
    id: string
  ): Promise<[APIResponse, ApiErrorResponse]> {
    // -------------------------------------------------------------------------
    // REQUEST
    // -------------------------------------------------------------------------
    const [response, body] = await this.apiGET<ApiErrorResponse>(
      `${this.baseEndpoint}/${id}`
    );

    // -------------------------------------------------------------------------
    // FIXED ASSERTIONS
    // -------------------------------------------------------------------------
    expect(response.status()).toBe(404);
    expect(body.error).toBeDefined();

    return [response, body];
  }

  /**
   * {TEST-007}: Attempt to create with invalid payload
   *
   * POST /api/v1/{resources} with invalid data
   *
   * Fixed Assertions:
   * - Status code is 400 Bad Request
   * - Validation errors present
   *
   * @param payload - Invalid payload data
   * @returns Tuple of [response, errorBody, payload]
   */
  @atc('{TEST-007}')
  async create{Resource}WithInvalidPayload(
    payload: Partial<Create{Resource}Payload>
  ): Promise<[APIResponse, ApiErrorResponse, Partial<Create{Resource}Payload>]> {
    // -------------------------------------------------------------------------
    // REQUEST
    // -------------------------------------------------------------------------
    const [response, body] = await this.apiPOST<ApiErrorResponse, Partial<Create{Resource}Payload>>(
      this.baseEndpoint,
      payload
    );

    // -------------------------------------------------------------------------
    // FIXED ASSERTIONS
    // -------------------------------------------------------------------------
    expect(response.status()).toBe(400);
    expect(body.error).toBeDefined();

    return [response, body, payload];
  }

  /**
   * {TEST-008}: Attempt unauthorized access
   *
   * GET /api/v1/{resources} without auth token
   *
   * Note: Call clearAuthToken() before this ATC
   *
   * Fixed Assertions:
   * - Status code is 401 Unauthorized
   *
   * @returns Tuple of [response, errorBody]
   */
  @atc('{TEST-008}')
  async get{Resources}Unauthorized(): Promise<[APIResponse, ApiErrorResponse]> {
    // -------------------------------------------------------------------------
    // REQUEST (without auth - must call clearAuthToken before)
    // -------------------------------------------------------------------------
    const [response, body] = await this.apiGET<ApiErrorResponse>(this.baseEndpoint);

    // -------------------------------------------------------------------------
    // FIXED ASSERTIONS
    // -------------------------------------------------------------------------
    expect(response.status()).toBe(401);
    expect(body.error).toBeDefined();

    return [response, body];
  }
}
```

---

### Step 4: Register Component in Fixture

Add the new component to `ApiFixture.ts`:

```typescript
// tests/components/ApiFixture.ts

import type { TestContextOptions } from '@components/TestContext';
import { ApiBase } from '@api/ApiBase';

// Import existing components
import { AuthApi } from '@api/AuthApi';
// Add new import
import { {Resource}Api } from '@api/{Resource}Api';

export class ApiFixture extends ApiBase {
  // Existing components
  public readonly auth: AuthApi;

  // Add new component
  public readonly {resource}: {Resource}Api;

  constructor(options: TestContextOptions) {
    super(options);

    // Initialize existing components
    this.auth = new AuthApi(options);

    // Initialize new component
    this.{resource} = new {Resource}Api(options);
  }
}
```

---

### Step 5: Implement Test File

Create the test file following KATA patterns:

#### Test File Template

```typescript
// tests/integration/{resource}/{resource}.test.ts

import { expect } from '@playwright/test';
import { test } from '@TestFixture';
import { faker } from '@faker-js/faker';
import type {
  Create{Resource}Payload,
  Update{Resource}Payload,
  {Resource}Response,
} from '@api/{Resource}Api';

// ============================================================================
// TEST SUITE: {Resource} API
// ============================================================================

test.describe('{Resource} API', () => {
  // ==========================================================================
  // AUTHENTICATION SETUP
  // ==========================================================================

  /**
   * Authenticate before each test.
   * Uses credentials from environment variables.
   */
  test.beforeEach(async ({ api }) => {
    await api.auth.authenticateSuccessfully({
      email: process.env.TEST_USER_EMAIL!,
      password: process.env.TEST_USER_PASSWORD!,
    });
  });

  // ==========================================================================
  // TEST DATA FACTORIES
  // ==========================================================================

  /**
   * Generate valid creation payload using Faker.
   * Called fresh in each test for unique data.
   */
  const createValidPayload = (): Create{Resource}Payload => ({
    name: faker.person.fullName(),
    email: faker.internet.email(),
    roleId: faker.number.int({ min: 1, max: 5 }),
  });

  /**
   * Generate update payload with partial data.
   */
  const createUpdatePayload = (): Update{Resource}Payload => ({
    name: faker.person.fullName(),
  });

  /**
   * Generate invalid payload for negative tests.
   */
  const createInvalidPayload = (): Partial<Create{Resource}Payload> => ({
    name: '', // Empty name should fail validation
    email: 'not-an-email', // Invalid email format
  });

  // ==========================================================================
  // TESTS: CREATE (POST)
  // ==========================================================================

  test('should create {resource} successfully @integration @{resource}', async ({ api }) => {
    // -------------------------------------------------------------------------
    // ARRANGE
    // -------------------------------------------------------------------------
    const payload = createValidPayload();

    // -------------------------------------------------------------------------
    // ACT
    // -------------------------------------------------------------------------
    const [response, body, sentPayload] = await api.{resource}.create{Resource}Successfully(payload);

    // -------------------------------------------------------------------------
    // ASSERT (optional - beyond ATC assertions)
    // -------------------------------------------------------------------------
    expect(body.name).toBe(sentPayload.name);
    expect(body.email).toBe(sentPayload.email);
  });

  test('should fail to create with invalid payload @integration @{resource}', async ({ api }) => {
    // -------------------------------------------------------------------------
    // ARRANGE
    // -------------------------------------------------------------------------
    const invalidPayload = createInvalidPayload();

    // -------------------------------------------------------------------------
    // ACT
    // -------------------------------------------------------------------------
    const [response, errorBody] = await api.{resource}.create{Resource}WithInvalidPayload(invalidPayload);

    // -------------------------------------------------------------------------
    // ASSERT
    // -------------------------------------------------------------------------
    expect(errorBody.error).toBeDefined();
  });

  // ==========================================================================
  // TESTS: READ (GET)
  // ==========================================================================

  test('should get {resource} by ID @integration @{resource}', async ({ api }) => {
    // -------------------------------------------------------------------------
    // ARRANGE: Create resource first
    // -------------------------------------------------------------------------
    const [, created] = await api.{resource}.create{Resource}Successfully(createValidPayload());

    // -------------------------------------------------------------------------
    // ACT
    // -------------------------------------------------------------------------
    const [response, body] = await api.{resource}.get{Resource}Successfully(created.id);

    // -------------------------------------------------------------------------
    // ASSERT
    // -------------------------------------------------------------------------
    expect(body.id).toBe(created.id);
    expect(body.name).toBe(created.name);
  });

  test('should return 404 for non-existent {resource} @integration @{resource}', async ({ api }) => {
    // -------------------------------------------------------------------------
    // ARRANGE
    // -------------------------------------------------------------------------
    const nonExistentId = faker.string.uuid();

    // -------------------------------------------------------------------------
    // ACT
    // -------------------------------------------------------------------------
    const [response, errorBody] = await api.{resource}.get{Resource}WithNonExistentId(nonExistentId);

    // -------------------------------------------------------------------------
    // ASSERT
    // -------------------------------------------------------------------------
    expect(response.status()).toBe(404);
  });

  test('should get all {resources} with pagination @integration @{resource}', async ({ api }) => {
    // -------------------------------------------------------------------------
    // ACT
    // -------------------------------------------------------------------------
    const [response, body] = await api.{resource}.getAll{Resources}Successfully({
      page: 1,
      limit: 10,
    });

    // -------------------------------------------------------------------------
    // ASSERT
    // -------------------------------------------------------------------------
    expect(body.data).toBeDefined();
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.limit).toBe(10);
  });

  // ==========================================================================
  // TESTS: UPDATE (PUT/PATCH)
  // ==========================================================================

  test('should update {resource} successfully @integration @{resource}', async ({ api }) => {
    // -------------------------------------------------------------------------
    // ARRANGE: Create resource first
    // -------------------------------------------------------------------------
    const [, created] = await api.{resource}.create{Resource}Successfully(createValidPayload());
    const updatePayload = createUpdatePayload();

    // -------------------------------------------------------------------------
    // ACT
    // -------------------------------------------------------------------------
    const [response, updated] = await api.{resource}.update{Resource}Successfully(
      created.id,
      updatePayload
    );

    // -------------------------------------------------------------------------
    // ASSERT
    // -------------------------------------------------------------------------
    expect(updated.name).toBe(updatePayload.name);
    expect(updated.id).toBe(created.id); // ID unchanged
  });

  // ==========================================================================
  // TESTS: DELETE
  // ==========================================================================

  test('should delete {resource} successfully @integration @{resource}', async ({ api }) => {
    // -------------------------------------------------------------------------
    // ARRANGE: Create resource to delete
    // -------------------------------------------------------------------------
    const [, created] = await api.{resource}.create{Resource}Successfully(createValidPayload());

    // -------------------------------------------------------------------------
    // ACT
    // -------------------------------------------------------------------------
    const [response] = await api.{resource}.delete{Resource}Successfully(created.id);

    // -------------------------------------------------------------------------
    // ASSERT: Verify deletion
    // -------------------------------------------------------------------------
    const [getResponse] = await api.{resource}.get{Resource}WithNonExistentId(created.id);
    expect(getResponse.status()).toBe(404);
  });

  // ==========================================================================
  // TESTS: AUTHORIZATION
  // ==========================================================================

  test('should return 401 without authentication @integration @{resource}', async ({ api }) => {
    // -------------------------------------------------------------------------
    // ARRANGE: Clear auth token
    // -------------------------------------------------------------------------
    api.clearAuthToken();

    // -------------------------------------------------------------------------
    // ACT
    // -------------------------------------------------------------------------
    const [response, errorBody] = await api.{resource}.get{Resources}Unauthorized();

    // -------------------------------------------------------------------------
    // ASSERT
    // -------------------------------------------------------------------------
    expect(response.status()).toBe(401);
  });
});
```

---

### Step 6: Run and Validate

Execute the test to verify implementation:

```bash
# Run specific test file
bun run test tests/integration/{resource}/{resource}.test.ts

# Run with verbose output
bun run test --reporter=list tests/integration/{resource}/{resource}.test.ts

# Run only specific test
bun run test --grep "should create {resource}" tests/integration/{resource}/
```

---

## Code Quality Checklist

Before completing the Coding phase, verify:

### Component Quality
- [ ] Extends `ApiBase` correctly
- [ ] Constructor accepts `TestContextOptions`
- [ ] `@atc` decorator with correct Test ID
- [ ] Returns tuple: `[APIResponse, TBody]` or `[APIResponse, TBody, TPayload]`
- [ ] Fixed assertions inside ATC
- [ ] Type-safe generics on api methods
- [ ] Import aliases used (`@api/`, `@utils/`, etc.)

### Test File Quality
- [ ] Imports `test` from `@TestFixture`
- [ ] `beforeEach` with authentication (if needed)
- [ ] Test data generated fresh (Faker)
- [ ] ARRANGE-ACT-ASSERT structure
- [ ] Appropriate tags (`@integration`, `@{resource}`)
- [ ] Each test is independent

### Type Safety
- [ ] Request types defined (Payload)
- [ ] Response types defined
- [ ] Error response type defined
- [ ] Types exported for test file use
- [ ] No `any` types

---

## Common Implementation Patterns

### API Method Usage

```typescript
// GET - Returns [response, body]
const [response, body] = await this.apiGET<{Resource}Response>(endpoint);

// POST - Returns [response, body] but ATC returns [response, body, payload]
const [response, body] = await this.apiPOST<{Resource}Response, CreatePayload>(
  endpoint,
  payload
);

// PUT - Same as POST
const [response, body] = await this.apiPUT<{Resource}Response, UpdatePayload>(
  endpoint,
  payload
);

// PATCH - Same as PUT
const [response, body] = await this.apiPATCH<{Resource}Response, PartialPayload>(
  endpoint,
  payload
);

// DELETE - Usually no body
const [response] = await this.apiDELETE(endpoint);
```

### Chaining Operations (in tests)

```typescript
test('should chain operations', async ({ api }) => {
  // Create → Update → Verify
  const [, created] = await api.resource.createSuccessfully(data);
  const [, updated] = await api.resource.updateSuccessfully(created.id, updates);
  const [, fetched] = await api.resource.getSuccessfully(created.id);

  expect(fetched.name).toBe(updates.name);
});
```

### Testing with Related Resources

```typescript
test('should create with foreign key', async ({ api }) => {
  // First create related resource
  const [, relatedResource] = await api.related.createSuccessfully(relatedData);

  // Then create main resource with foreign key
  const payload = {
    ...createValidPayload(),
    relatedId: relatedResource.id,
  };

  const [, created] = await api.resource.createSuccessfully(payload);
  expect(created.relatedId).toBe(relatedResource.id);
});
```

---

## Anti-Patterns to Avoid

### ❌ Wrong: Missing Return Type Tuple

```typescript
@atc('TEST-001')
async createResource(payload) {
  const response = await this.apiPOST(endpoint, payload);
  return response; // Missing tuple format
}
```

### ✅ Correct: Proper Tuple Return

```typescript
@atc('TEST-001')
async createResourceSuccessfully(
  payload: CreatePayload
): Promise<[APIResponse, ResourceResponse, CreatePayload]> {
  const [response, body] = await this.apiPOST<ResourceResponse, CreatePayload>(
    endpoint,
    payload
  );
  expect(response.status()).toBe(201);
  return [response, body, payload];
}
```

### ❌ Wrong: Missing Type Generics

```typescript
const [response, body] = await this.apiGET(endpoint); // No type = any
```

### ✅ Correct: Type-Safe Generics

```typescript
const [response, body] = await this.apiGET<ResourceResponse>(endpoint);
```

### ❌ Wrong: Hardcoded Test Data

```typescript
const payload = {
  email: 'test@example.com', // Hardcoded!
  id: '123e4567-e89b-12d3-a456-426614174000', // Hardcoded UUID!
};
```

### ✅ Correct: Dynamic Test Data

```typescript
const payload = {
  email: faker.internet.email(),
  id: faker.string.uuid(),
};
```

---

## Output Checklist

After completing the Coding phase:

- [ ] API Component created: `tests/components/api/{Resource}Api.ts`
- [ ] Component registered in: `tests/components/ApiFixture.ts`
- [ ] Test file created: `tests/integration/{resource}/{resource}.test.ts`
- [ ] Types defined: `tests/data/types.ts`
- [ ] Test passes locally: `bun run test <test-file>`
- [ ] No TypeScript errors: `bun run type-check`
- [ ] Linting passes: `bun run lint`

---

## Next Step

Once implementation is complete and tests pass:

→ **Proceed to**: `review/integration-test-review.md` (Phase 3)
