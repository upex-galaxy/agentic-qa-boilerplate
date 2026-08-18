# AUTH-T01: User Session Validation

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Phase** | Phase 1 - Core Auth |
| **Items** | 4 TCs |
| **Dependencies** | None (foundation ticket) |
| **Requires** | Valid test user in `.env`, UPEX Dojo API running |

## Summary

Validate that the authentication API and UI correctly manage user sessions: login with valid credentials creates a valid session, login with invalid credentials is rejected, and authenticated endpoints enforce token requirements.

## Preconditions

- UPEX Dojo API running at configured `apiUrl`
- Test user credentials configured in `.env`
- For UI tests: browser navigated to `/login` via `goto()`

## Test Cases

### AUTH-001: Validate successful authentication when valid credentials are provided (API)

**Preconditions**: Valid test user exists in the system
**Action**: POST /auth/login with valid email and password
**Expected Output**:
- Response status is 200
- Token has `access_token`, `token_type` "Bearer", `expires_in` > 0
- GET /auth/me returns 200 with matching email (session is valid)

```gherkin
Scenario: AUTH-001 - Validate successful authentication when valid credentials are provided
  Given a valid test user exists in the system
  When the user sends POST /auth/login with valid credentials
  Then the response status is 200
  And the response contains a valid JWT token
  And GET /auth/me confirms the session is valid with matching user email
```

### AUTH-002: Validate authentication rejection when invalid credentials are provided (API)

**Preconditions**: No active session
**Action**: POST /auth/login with invalid email or wrong password
**Expected Output**:
- Response status is 401
- Response contains error message
- GET /auth/me returns 401 (no session was created)

```gherkin
Scenario: AUTH-002 - Validate authentication rejection when invalid credentials are provided
  Given no active user session exists
  When the user sends POST /auth/login with invalid credentials
  Then the response status is 401
  And the response contains an error message
  And GET /auth/me confirms no session was created
```

### AUTH-003: Validate successful login when valid credentials are submitted via UI

**Preconditions**: Browser navigated to `/login`, valid test user exists
**Action**: Fill login form with valid credentials and submit
**Expected Output**:
- Page redirects away from `/login`

```gherkin
Scenario: AUTH-003 - Validate successful login when valid credentials are submitted via UI
  Given the user is on the login page
  When the user fills in valid credentials and submits the form
  Then the page redirects away from /login
```

### AUTH-004: Validate protected endpoint enforcement when no token is provided (API)

**Preconditions**: Auth token cleared
**Action**: GET /auth/me without a token
**Expected Output**:
- Response status is 401
- Response is not ok

```gherkin
Scenario: AUTH-004 - Validate protected endpoint enforcement when no token is provided
  Given the auth token has been cleared
  When the user sends GET /auth/me without authentication
  Then the response status is 401
  And the response is not ok
```

## Acceptance Criteria

- [ ] All 4 TCs automated and passing
- [ ] API ATCs follow ACTION + VERIFICATION pattern
- [ ] UI ATC uses `data-testid` locators
- [ ] No hardcoded credentials in test code (use config)
- [ ] Test isolation: each test gets fresh fixture state
