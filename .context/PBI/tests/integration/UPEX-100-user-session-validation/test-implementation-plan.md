# Test Implementation Plan: UPEX-100

> **Ticket**: [UPEX-100: Validate User Session Management](https://upex.atlassian.net/browse/UPEX-100)
> **Type**: `integration`
> **Sprint**: Sprint 1
> **Created**: 2026-03-19

---

## 1. Ticket Summary

**What to test:**
Validate that the authentication API correctly manages user sessions: login with valid credentials creates a valid session, login with invalid credentials is rejected, and authenticated endpoints enforce token requirements.

**Acceptance Criteria:**
1. Valid credentials via POST /auth/login return a JWT token with correct structure
2. The JWT token grants access to GET /auth/me (returns user info)
3. Invalid credentials return 401 with error message and do NOT create a session
4. Requests to protected endpoints without a token return 401

**Dependencies:**
- UPEX Dojo API running at configured `apiUrl`
- Test user credentials configured in `.env`

---

## 2. Architecture Decisions

### Component Strategy

| Decision | Value | Rationale |
|----------|-------|-----------|
| **Component** | `AuthApi.ts` | Existing — owns `/auth/*` endpoints |
| **Fixture** | `{ api }` | Pure API testing, no browser needed |
| **Test file** | `tests/integration/auth/user-session.test.ts` | Groups all session validation scenarios |
| **Preconditions** | Inline (token from api-state.json) | ApiFixture auto-loads token from setup |

### API Details

| Aspect | Value |
|--------|-------|
| **Endpoint(s)** | `POST /api/auth/login`, `GET /api/auth/me` |
| **OpenAPI Type(s)** | `LoginPayload`, `TokenResponse`, `UserInfoResponse`, `AuthErrorResponse` |
| **Auth Required** | Login: No, Me: Yes |
| **Return Pattern** | Tuple: `[APIResponse, TBody]` (GET) / `[APIResponse, TBody, TPayload]` (POST) |

**Request/Response Shapes:**
```typescript
// POST /auth/login — Request
interface LoginPayload {
  email: string;
  password: string;
}

// POST /auth/login — Response (200)
interface TokenResponse {
  access_token: string;
  token_type: string;    // "Bearer"
  expires_in: number;
}

// POST /auth/login — Response (401)
interface AuthErrorResponse {
  error: string;
}

// GET /auth/me — Response (200)
interface UserInfoResponse {
  user: {
    id: string;
    email: string;
    name: string;
  };
}
```

---

## 3. ATC Registry

### Existing ATCs (Reuse)

| ATC ID | Component | Method | Description |
|--------|-----------|--------|-------------|
| `PROJ-101` | `AuthApi` | `authenticateSuccessfully()` | POST login + GET /me verification — confirms valid session |
| `PROJ-102` | `AuthApi` | `loginWithInvalidCredentials()` | POST bad creds + GET /me → 401 — confirms no session created |

### New ATCs (Create)

_None — existing ATCs cover all scenarios._

### Helpers (No `@atc`)

| Component | Method | Returns | Description |
|-----------|--------|---------|-------------|
| `AuthApi` | `getCurrentUser()` | `[APIResponse, UserInfoResponse]` | Read-only GET /auth/me — used for verification steps and test-level assertions |

> **Design Decision:** `getCurrentUser()` is a **helper**, not an ATC. Per `test-design-principles.md`, simple GETs that just retrieve data are not ATCs. The GET /auth/me call is absorbed as a verification step inside `authenticateSuccessfully()` and `loginWithInvalidCredentials()`, where it validates that a session was (or was not) created.

---

## 4. Test Data Strategy

### Required Data

| Data | Source | Lifecycle |
|------|--------|-----------|
| Valid credentials | `config.testUser` (from `.env`) | Shared — pre-existing test user |
| Invalid credentials | Inline object in test | Per-test — hardcoded bad values |
| Auth token | `api-state.json` (from api-setup project) | Shared — loaded by ApiFixture |

### DataFactory Additions

_None needed — credentials come from config, not generated data._

### Constants Additions

_None needed._

---

## 5. Test Scenarios

### File: `tests/integration/auth/user-session.test.ts`

**Fixture:** `{ api }`

#### Scenario 1: Get current user with valid token
```
Test: "UPEX-100: should get current user with valid token"
Preconditions: Token auto-loaded from api-state.json
ATCs called: None (uses helper getCurrentUser() directly)
Test-level assertions: [status 200, user.id defined, user.email defined, user.name is string]
Teardown: None
```

#### Scenario 2: Fail without token
```
Test: "UPEX-100: should fail without token"
Preconditions: Token cleared via api.clearAuthToken()
ATCs called: None (uses helper getCurrentUser() directly)
Test-level assertions: [status 401, response.ok() is false]
Teardown: None (each test gets fresh fixture)
```

#### Scenario 3: Re-authenticate at runtime
```
Test: "UPEX-100: should be able to re-authenticate"
Preconditions: Token cleared via api.clearAuthToken()
ATCs called: [AuthApi.authenticateSuccessfully(credentials)]
Test-level assertions: [status 200, access_token defined]
Teardown: None
```

> **Why scenarios 1 and 2 don't use ATCs:** These tests validate the helper `getCurrentUser()` directly — they test token propagation, not the authentication flow. The ATC `authenticateSuccessfully` already includes GET /auth/me as an internal verification step.

---

## 6. Implementation Order

- [x] **Step 1**: Types already exist in `@schemas/auth.types`
- [x] **Step 2**: No DataFactory additions needed
- [x] **Step 3**: No constants needed
- [x] **Step 4**: Refactored `AuthApi.ts` — PROJ-103/104 removed as ATCs, `getCurrentUser()` added as helper, GET /me verification added to PROJ-101/102
- [x] **Step 5**: Component already registered in `ApiFixture.ts`
- [x] **Step 6**: Test file updated to use helper instead of removed ATCs
- [x] **Step 7**: Tests pass locally

---

## 7. Success Criteria

- [x] All acceptance criteria from ticket covered
- [x] ATCs follow KATA architecture (ACTION + VERIFICATION pattern)
- [x] Test file uses `{ api }` fixture (no browser overhead)
- [x] Helpers are NOT decorated with `@atc`
- [x] Import aliases used (`@TestFixture`, `@schemas/`)
- [x] Tests pass locally

---

## Cross-References

- **ATC Spec (PROJ-101)**: `.context/PBI/tests/atc/auth/UPEX-101-authenticate-successfully.md`
- **ATC Spec (PROJ-102)**: Part of AuthApi, follows same pattern as PROJ-101
- **Component**: `tests/components/api/AuthApi.ts`
- **Test file**: `tests/integration/auth/user-session.test.ts`

## Next Step

Proceed to Phase 2 (Coding) with:
- **Integration tests**: `.prompts/stage-4-automation/coding/integration-test-coding.md`
