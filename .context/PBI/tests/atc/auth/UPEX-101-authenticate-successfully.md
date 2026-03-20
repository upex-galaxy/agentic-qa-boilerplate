# ATC Spec: UPEX-101 — Authenticate Successfully

> **Ticket**: [UPEX-101](https://upex.atlassian.net/browse/UPEX-101)
> **Component**: `AuthApi` (`tests/components/api/AuthApi.ts`)
> **Type**: API — Mutation
> **Parent Story**: UPEX-100 (Validate User Session Management)

---

## 1. Test Case Summary

| Field | Value |
|-------|-------|
| **Name** | Authenticate with valid credentials |
| **Objective** | Validates that POST /auth/login with valid credentials returns a JWT token and the session is usable |
| **Precondition** | Valid test user exists in the system (configured in `.env`) |
| **Acceptance Criteria** | Login returns 200 with valid token; subsequent GET /auth/me confirms session |

---

## 2. ATC Contract

```typescript
/**
 * ATC: Authenticate with valid credentials - expects success (200)
 *
 * Complete flow:
 * 1. POST credentials to /auth/login (ACTION)
 * 2. GET /auth/me to confirm session is valid (VERIFICATION)
 * 3. Validate token response and user info
 *
 * Fixed assertions:
 * - Response status is 200
 * - Token has access_token, token_type "Bearer", expires_in > 0
 * - GET /auth/me returns 200 with matching email
 */
@atc('PROJ-101')
async authenticateSuccessfully(
  credentials: LoginPayload,
): Promise<[APIResponse, TokenResponse, LoginPayload]>
```

### Method Signature

| Aspect | Value |
|--------|-------|
| **Name** | `authenticateSuccessfully` |
| **Parameters** | `credentials: LoginPayload` (email + password) |
| **Return Type** | `Promise<[APIResponse, TokenResponse, LoginPayload]>` |

---

## 3A. API Details

### Endpoint

| Aspect | Value |
|--------|-------|
| **Method** | `POST` (action) + `GET` (verification) |
| **Path** | `POST /api/auth/login` → `GET /api/auth/me` |
| **Auth Required** | Login: No, Me: Yes (uses token from login) |
| **Content-Type** | `application/json` |

### Return Type

```typescript
// POST mutation — returns tuple with payload
Promise<[APIResponse, TokenResponse, LoginPayload]>
```

### OpenAPI Types

```typescript
import type { LoginPayload, TokenResponse, UserInfoResponse } from '@schemas/auth.types';

interface LoginPayload {
  email: string;
  password: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;    // "Bearer"
  expires_in: number;
}

interface UserInfoResponse {
  user: {
    id: string;
    email: string;
    name: string;
  };
}
```

### Request Body

```typescript
const credentials: LoginPayload = {
  email: config.testUser.email,
  password: config.testUser.password,
};
```

### Expected Response

```json
// POST /auth/login → 200
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600
}

// GET /auth/me → 200 (verification step)
{
  "user": {
    "id": "uuid-here",
    "email": "test@example.com",
    "name": "Test User"
  }
}
```

---

## 4. Assertions Split

### Fixed Assertions (Inside ATC)

| # | Assertion | Code |
|---|-----------|------|
| 1 | Login returns 200 | `expect(response.status()).toBe(200)` |
| 2 | Token is present | `expect(body.access_token).toBeDefined()` |
| 3 | Token type is Bearer | `expect(body.token_type).toBe('Bearer')` |
| 4 | Token has expiry | `expect(body.expires_in).toBeGreaterThan(0)` |
| 5 | Session is valid (GET /me → 200) | `expect(meResponse.status()).toBe(200)` |
| 6 | User info is present | `expect(meBody.user).toBeDefined()` |
| 7 | Email matches credentials | `expect(meBody.user.email).toBe(credentials.email)` |

### Test-Level Assertions (In Test File)

| # | Assertion | Why It's Test-Level |
|---|-----------|---------------------|
| 1 | Token string format | Depends on JWT implementation specifics |
| 2 | User name value | Changes per test user |
| 3 | Token reusability | Specific to re-authentication scenarios |

---

## 5. Code Template

```typescript
// In: tests/components/api/AuthApi.ts

/**
 * ATC: Authenticate with valid credentials - expects success (200)
 *
 * Complete flow:
 * 1. POST credentials to /auth/login (ACTION)
 * 2. GET /auth/me to confirm session is valid (VERIFICATION)
 * 3. Validate token response and user info
 */
@atc('PROJ-101')
async authenticateSuccessfully(
  credentials: LoginPayload,
): Promise<[APIResponse, TokenResponse, LoginPayload]> {
  // ACTION: POST login credentials
  const [response, body, sentPayload] = await this.apiPOST<TokenResponse, LoginPayload>(
    this.config.auth.loginEndpoint,
    credentials,
  );

  // Fixed assertions - validates successful authentication
  expect(response.status()).toBe(200);
  expect(body.access_token).toBeDefined();
  expect(body.token_type).toBe('Bearer');
  expect(body.expires_in).toBeGreaterThan(0);

  // Store token for subsequent requests
  this.setAuthToken(body.access_token);

  // VERIFICATION: Confirm the session is valid via GET /auth/me
  const [meResponse, meBody] = await this.getCurrentUser();
  expect(meResponse.status()).toBe(200);
  expect(meBody.user).toBeDefined();
  expect(meBody.user.email).toBe(credentials.email);

  return [response, body, sentPayload];
}
```

**Usage in test file:**

```typescript
// In: tests/integration/auth/user-session.test.ts

test('should be able to re-authenticate', async ({ api }) => {
  api.clearAuthToken();

  const credentials = {
    email: config.testUser.email,
    password: config.testUser.password,
  };

  const [response, tokenData] = await api.auth.authenticateSuccessfully(credentials);

  // Test-level assertions
  expect(response.status()).toBe(200);
  expect(tokenData.access_token).toBeDefined();
});
```

---

## 6. Equivalence Partitioning Check

| Input Variation | Expected Output | Same ATC? |
|-----------------|-----------------|-----------|
| Valid email + valid password | 200 + token + session created | Yes — Base case |
| Different valid user | 200 + token + session created | Yes — same output type, parameterize |
| Invalid email | 401 + error + no session | No — `loginWithInvalidCredentials` (PROJ-102) |
| Valid email + wrong password | 401 + error + no session | No — `loginWithInvalidCredentials` (PROJ-102) |

**Decision**: One ATC for all valid credential combinations (same output type: 200 + token). A separate ATC (`loginWithInvalidCredentials`) for all invalid credential combinations (same output type: 401 + error).

---

## 7. Dependencies

### Precondition Steps

| Step | How | Component |
|------|-----|-----------|
| None | Token auto-loaded from api-state.json | ApiFixture |

### Required Components

| Component | Exists? | Action Needed |
|-----------|---------|---------------|
| `AuthApi` | Yes | Method already exists |
| `ApiFixture` | Yes | Already registered |

### Helper Dependencies

| Helper | Component | Used By |
|--------|-----------|---------|
| `getCurrentUser()` | `AuthApi` | Internal verification step in this ATC |

---

## 8. Checklist

- [x] Method name follows `{verb}{Resource}{Scenario}` convention
- [x] Parameters: 1 positional (under max 2 limit)
- [x] Return type matches API mutation pattern (tuple with payload)
- [x] Fixed assertions validate success invariants
- [x] Test-level assertions documented for test file
- [x] Not duplicating an existing ATC (equivalence partitioning checked)
- [x] OpenAPI types identified (`LoginPayload`, `TokenResponse`)
- [x] Component placement determined (existing `AuthApi`)
- [x] Precondition steps identified (none needed)
- [x] ATC includes VERIFICATION step (GET /auth/me confirms session)

---

## Cross-References

- **Test plan**: `.context/PBI/tests/integration/UPEX-100-user-session-validation/test-implementation-plan.md`
- **Companion ATC**: UPEX-102 (`loginWithInvalidCredentials`) — same component, negative path
- **Component**: `tests/components/api/AuthApi.ts`
- **Guidelines**: `.context/guidelines/TAE/test-design-principles.md`
