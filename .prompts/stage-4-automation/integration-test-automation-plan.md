# Integration Test Automation Plan

> **Phase**: 1 of 3 (Plan → Coding → Review)
> **Purpose**: Analyze a documented API test case and create an implementation plan following KATA architecture.
> **Output**: Detailed plan ready for the Coding phase.

---

## Context Loading

**Load these files before proceeding:**

1. `.context/guidelines/TAE/kata-ai-index.md` → Core KATA patterns
2. `.context/guidelines/TAE/kata-architecture.md` → Layer structure
3. `.context/guidelines/TAE/api-testing-patterns.md` → API specific patterns
4. `.context/guidelines/TAE/typescript-patterns.md` → TypeScript conventions
5. `.context/playwright-automation-system.md` → Code architecture overview
6. `.context/test-management-system.md` → TMS configuration

**Optional (for API exploration):**
- Use OpenAPI MCP (`mcp__openapi__*`) if available
- Use Postman MCP (`mcp__postman__*`) if available

---

## Input Required

Provide the documented API test case from Stage 3 with:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ REQUIRED INPUT FROM STAGE 3                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Test Case ID: {TEST-XXX}                                                 │
│ 2. Test Case Name: {Validate <CORE> <CONDITIONAL>}                          │
│ 3. API Endpoint Details:                                                    │
│    - HTTP Method: GET/POST/PUT/PATCH/DELETE                                 │
│    - Endpoint: /api/v1/resource                                             │
│    - Request Body (if applicable)                                           │
│    - Expected Response (status code, body structure)                        │
│ 4. Gherkin Scenario (Given/When/Then)                                       │
│ 5. Variables Table (with how to obtain each variable)                       │
│ 6. Authentication Requirements                                              │
│ 7. Priority/ROI Score (optional)                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Planning Workflow

### Step 1: API Test Case Analysis

Extract and document:

```markdown
## API Test Case Analysis

### Basic Information
- **Test ID**: {TEST-XXX}
- **Name**: {test case name}
- **Type**: Integration (API only)
- **Priority**: {Critical/High/Medium/Low}

### API Endpoint Details

| Attribute | Value |
|-----------|-------|
| Method | GET / POST / PUT / PATCH / DELETE |
| Endpoint | `/api/v1/{resource}` |
| Auth Required | Yes (Bearer) / No |
| Content-Type | application/json |

### Request Analysis

**Path Parameters** (if any):
| Parameter | Type | Description |
|-----------|------|-------------|
| {id} | string (UUID) | Resource identifier |

**Query Parameters** (if any):
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | number | No | Pagination |
| limit | number | No | Items per page |

**Request Body** (if POST/PUT/PATCH):
```json
{
  "field1": "value1",
  "field2": "value2"
}
```

### Expected Response

**Success Case (2xx)**:
| Attribute | Expected |
|-----------|----------|
| Status Code | 200 / 201 / 204 |
| Body Structure | See below |

```json
{
  "id": "uuid",
  "field1": "value",
  "createdAt": "ISO-8601"
}
```

**Error Cases**:
| Scenario | Status | Error Response |
|----------|--------|----------------|
| Not found | 404 | `{ "error": "Resource not found" }` |
| Invalid input | 400 | `{ "error": "Validation failed", "details": [...] }` |
| Unauthorized | 401 | `{ "error": "Unauthorized" }` |

### Variables Identified

| Variable | Type | How to Obtain | Faker Pattern |
|----------|------|---------------|---------------|
| {user_id} | UUID | API setup | `await api.users.createSuccessfully()` |
| {email} | string | Generate | `faker.internet.email()` |
| {token} | string | Auth setup | `await api.auth.authenticateSuccessfully()` |
```

---

### Step 2: Existing Components Check

Search the codebase for existing components:

```bash
# Check existing API components
ls tests/components/api/

# Check existing fixtures
cat tests/components/ApiFixture.ts

# Search for similar ATCs
grep -r "@atc" tests/components/api/

# Check for existing types
grep -r "interface.*Response" tests/data/types.ts
```

Document findings:

```markdown
## Existing Components Analysis

### Relevant API Components Found
| Component | File | ATCs Available | Can Reuse? |
|-----------|------|----------------|------------|
| AuthApi | tests/components/api/AuthApi.ts | authenticateSuccessfully | Yes (for auth setup) |
| UsersApi | tests/components/api/UsersApi.ts | createUserSuccessfully | Yes/Partial/No |

### Existing Types Found
| Type | File | Can Reuse? |
|------|------|------------|
| TokenResponse | tests/data/types.ts | Yes |
| UserPayload | tests/data/types.ts | Yes |

### Decision
- [ ] Create NEW component: {Resource}Api.ts
- [ ] Extend EXISTING component: {existing}.ts
- [ ] Use ONLY existing components (no new code needed)
```

---

### Step 3: Type Definitions Plan

Plan all TypeScript types needed:

```markdown
## Type Definitions Plan

### Request Types (Payload)

```typescript
// For POST/PUT/PATCH requests
export interface Create{Resource}Payload {
  field1: string;
  field2: number;
  // ... based on API spec
}

export interface Update{Resource}Payload {
  field1?: string;  // Optional for partial update
  field2?: number;
}
```

### Response Types

```typescript
// Success response
export interface {Resource}Response {
  id: string;
  field1: string;
  field2: number;
  createdAt: string;
  updatedAt: string;
}

// List response (for GET all)
export interface {Resource}ListResponse {
  data: {Resource}Response[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

// Error response
export interface ApiErrorResponse {
  error: string;
  message?: string;
  details?: Record<string, string[]>;
}
```

### Where to Define
- [ ] In component file (if specific to this component)
- [ ] In `tests/data/types.ts` (if shared across components)
```

---

### Step 4: Architecture Decision

Determine the KATA architecture:

```markdown
## Architecture Decision

### Component Location
- **Layer**: 3 (Domain Component)
- **Type**: API Component
- **File**: `tests/components/api/{Resource}Api.ts`
- **Extends**: `ApiBase`

### Fixture
- **Use**: `{ api }` fixture (no browser needed)
- **Registration**: Add to `ApiFixture.ts`

### Authentication Strategy
| Strategy | When to Use | Implementation |
|----------|-------------|----------------|
| Setup in test | Fresh token per test | `beforeEach` with `api.auth.authenticateSuccessfully()` |
| Stored state | Reuse token across tests | Load from `.auth/api-state.json` |
| No auth | Public endpoints | Skip auth setup |

### Dependencies
| Dependency | Purpose | Implementation |
|------------|---------|----------------|
| Auth token | Authenticated requests | Via `ApiBase.setAuthToken()` |
| Test data | Dynamic values | Via `DataFactory` or Faker |
| Related resource | Foreign key | Create via API first |
```

---

### Step 5: ATC Design

Design the ATCs to implement:

```markdown
## ATC Design

### ATC for Success Case

| Attribute | Value |
|-----------|-------|
| **Name** | `{verb}{Resource}Successfully` |
| **Test ID** | `{TEST-XXX}` |
| **HTTP Method** | GET / POST / PUT / PATCH / DELETE |
| **Returns** | Tuple (see below) |

**Method Signature:**
```typescript
// GET/DELETE: Returns [APIResponse, TBody]
@atc('{TEST-XXX}')
async get{Resource}Successfully(id: string): Promise<[APIResponse, {Resource}Response]>

// POST/PUT/PATCH: Returns [APIResponse, TBody, TPayload]
@atc('{TEST-XXX}')
async create{Resource}Successfully(
  payload: Create{Resource}Payload
): Promise<[APIResponse, {Resource}Response, Create{Resource}Payload]>
```

**Fixed Assertions:**
1. `expect(response.status()).toBe(200)` // or 201, 204
2. `expect(body.id).toBeDefined()`
3. `expect(body.field1).toBe(payload.field1)` // echo check

### ATC for Error Case (if applicable)

| Attribute | Value |
|-----------|-------|
| **Name** | `{verb}{Resource}WithInvalid{X}` or `{verb}{Resource}Unauthorized` |
| **Test ID** | `{TEST-YYY}` |
| **Expected Status** | 400 / 401 / 404 |

**Method Signature:**
```typescript
@atc('{TEST-YYY}')
async get{Resource}WithNonExistentId(
  id: string
): Promise<[APIResponse, ApiErrorResponse]>
```

**Fixed Assertions:**
1. `expect(response.status()).toBe(404)`
2. `expect(body.error).toBeDefined()`
```

---

### Step 6: Test File Design

Design the test file structure:

```markdown
## Test File Design

### File Location
`tests/integration/{resource}/{resource}.test.ts`

### Test Structure
```typescript
import { test, expect } from '@TestFixture';
import type { Create{Resource}Payload } from '@api/{Resource}Api';

test.describe('{Resource} API', () => {
  // Auth setup (if needed)
  test.beforeEach(async ({ api }) => {
    await api.auth.authenticateSuccessfully({
      email: process.env.TEST_USER_EMAIL!,
      password: process.env.TEST_USER_PASSWORD!,
    });
  });

  test('should create {resource} successfully @integration @{resource}', async ({ api }) => {
    // ARRANGE
    const payload: Create{Resource}Payload = {
      field1: faker.lorem.word(),
      field2: faker.number.int({ min: 1, max: 100 }),
    };

    // ACT
    const [response, body, sentPayload] = await api.{resource}.create{Resource}Successfully(payload);

    // ASSERT (optional - beyond ATC assertions)
    expect(body.field1).toBe(sentPayload.field1);
  });
});
```

### Tags to Apply
- [ ] `@integration` - API test
- [ ] `@regression` - Include in regression suite
- [ ] `@smoke` - Include in smoke tests
- [ ] `@{resource}` - Resource-specific tag
```

---

### Step 7: Fixture Registration

Plan component registration:

```markdown
## Fixture Registration

### New Component Registration
Add to `ApiFixture.ts`:

```typescript
// Import
import { {Resource}Api } from '@api/{Resource}Api';

// In constructor
this.{resource} = new {Resource}Api(options);

// Add property
public readonly {resource}: {Resource}Api;
```

### Type Exports
Export types from component:

```typescript
// In {Resource}Api.ts - export for test file use
export type {
  Create{Resource}Payload,
  {Resource}Response,
} from '@data/types';

// Or define and export inline
export interface Create{Resource}Payload { ... }
```
```

---

## Plan Output Template

Generate a final plan document:

```markdown
# Implementation Plan: {TEST-XXX}

## Summary
| Attribute | Value |
|-----------|-------|
| Test Case ID | {TEST-XXX} |
| Test Name | {name} |
| API Method | GET / POST / PUT / PATCH / DELETE |
| Endpoint | `/api/v1/{resource}` |
| Component | {Resource}Api.ts |
| Action | CREATE / EXTEND / REUSE |
| ATC Name | `{methodName}` |
| Test File | tests/integration/{resource}/{resource}.test.ts |
| Fixture | `{ api }` |

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `tests/components/api/{Resource}Api.ts` | CREATE | New API component |
| `tests/components/ApiFixture.ts` | MODIFY | Register component |
| `tests/integration/{resource}/{resource}.test.ts` | CREATE | Test file |
| `tests/data/types.ts` | MODIFY | Add type definitions |

## Type Definitions

### Request Types
```typescript
export interface Create{Resource}Payload {
  // fields...
}
```

### Response Types
```typescript
export interface {Resource}Response {
  // fields...
}
```

## ATC Implementation Plan

### {methodName}
- **Decorator**: `@atc('{TEST-XXX}')`
- **Method**: `api{METHOD}<TBody, TPayload>(endpoint, payload?)`
- **Returns**: `[APIResponse, {Resource}Response, Create{Resource}Payload]`
- **Assertions**:
  - `expect(response.status()).toBe(201)`
  - `expect(body.id).toBeDefined()`

## Test Data Strategy

| Variable | Source | Pattern |
|----------|--------|---------|
| {field1} | Faker | `faker.lorem.word()` |
| {field2} | Faker | `faker.number.int({min: 1, max: 100})` |
| {related_id} | API Setup | `api.{related}.createSuccessfully()` |

## Authentication

| Approach | Implementation |
|----------|----------------|
| Per-test setup | `beforeEach` with `api.auth.authenticateSuccessfully()` |
| Token propagation | Auto-loaded from `.auth/api-state.json` |

## Dependencies

- [ ] Auth component: `AuthApi` (for token)
- [ ] Related resource: `{Related}Api` (for foreign keys)
- [ ] Types file: `tests/data/types.ts`

---

**Ready for Phase 2: Coding**
```

---

## Validation Checklist

Before proceeding to Coding phase, verify:

- [ ] API endpoint fully documented (method, path, params, body)
- [ ] Request/response types designed
- [ ] Expected status codes identified (success and error)
- [ ] Existing components checked (avoid duplication)
- [ ] Architecture decision made (component, fixture)
- [ ] ATC designed with proper return type (tuple)
- [ ] Assertions defined (status, body validation)
- [ ] Test file location determined
- [ ] Authentication strategy decided
- [ ] Test data generation planned (Faker patterns)

---

## Common Patterns

### Return Type Patterns

| HTTP Method | Return Type | Example |
|-------------|-------------|---------|
| GET (single) | `[APIResponse, TBody]` | `[response, user]` |
| GET (list) | `[APIResponse, TBody[]]` | `[response, users]` |
| POST | `[APIResponse, TBody, TPayload]` | `[response, created, payload]` |
| PUT/PATCH | `[APIResponse, TBody, TPayload]` | `[response, updated, payload]` |
| DELETE | `[APIResponse, void]` | `[response, _]` |

### Naming Conventions

| Operation | ATC Name Pattern | Example |
|-----------|------------------|---------|
| Create | `create{Resource}Successfully` | `createUserSuccessfully()` |
| Read | `get{Resource}Successfully` | `getUserSuccessfully()` |
| Update | `update{Resource}Successfully` | `updateUserSuccessfully()` |
| Delete | `delete{Resource}Successfully` | `deleteUserSuccessfully()` |
| List | `getAll{Resources}Successfully` | `getAllUsersSuccessfully()` |
| Not found | `get{Resource}WithNonExistentId` | `getUserWithNonExistentId()` |
| Invalid | `create{Resource}WithInvalidPayload` | `createUserWithInvalidPayload()` |

### Assertion Patterns

| What to Assert | Pattern |
|----------------|---------|
| Status code | `expect(response.status()).toBe(200)` |
| Field exists | `expect(body.id).toBeDefined()` |
| Field value | `expect(body.email).toBe(payload.email)` |
| Array length | `expect(body.data).toHaveLength(10)` |
| Error message | `expect(body.error).toContain('not found')` |

---

## Next Step

Once the plan is complete and validated:

→ **Proceed to**: `integration-test-automation-coding.md` (Phase 2)
