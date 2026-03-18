# Test Code Overview

## 1. Layer Architecture (KATA Framework)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ LAYER 4: FIXTURES (Entry Points)                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ TestFixture.ts                                                              │
│ ├── test: TestFixture (page + request → UI + API)                           │
│ ├── ui: UiFixture (page only)                                               │
│ ├── api: ApiFixture (request only, NO browser)                              │
│ └── steps: StepsFixture (reusable precondition chains)                      │
│                                                                             │
│ ApiFixture.ts                UiFixture.ts                                   │
│ ├── auth: AuthApi            ├── login: LoginPage                           │
│ └── example: ExampleApi      └── example: ExamplePage                       │
└─────────────────────────────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ LAYER 3: DOMAIN COMPONENTS (ATCs)                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│ AuthApi.ts                         LoginPage.ts                             │
│ ├── getCurrentUser() [HELPER]      ├── @atc loginSuccessfully()             │
│ ├── @atc authenticateSuccessfully()├── @atc loginWithInvalidCredentials()   │
│ └── @atc loginWithInvalidCreds()   └── goto() [call BEFORE ATC]            │
└─────────────────────────────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ LAYER 3.5: STEPS (Reusable ATC Chains)                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ AuthSteps.ts                                                                │
│ ├── setupAuthenticatedUser()                                                │
│ └── setupUserWithCart()                                                     │
└─────────────────────────────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ LAYER 2: BASE COMPONENTS (Helpers)                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ ApiBase.ts                         UiBase.ts                                │
│ ├── apiGET/POST/PUT/PATCH/DELETE   ├── page (getter)                        │
│ ├── setAuthToken/clearAuthToken    ├── buildUrl()                           │
│ ├── buildHeaders()                 ├── interceptResponse()                  │
│ └── apiEndpoint()                  └── waitForApiResponse()                 │
└─────────────────────────────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ LAYER 1: TEST CONTEXT (Foundation)                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ TestContext.ts                                                               │
│ ├── _page: Page (protected)                                                 │
│ ├── _request: APIRequestContext (protected)                                 │
│ ├── env: Environment                                                        │
│ ├── config: Config object                                                   │
│ └── data: DataFactory (static)                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Dependency Injection Flow

### 2.1 Test → Fixture → Component

```typescript
// Test file uses Playwright fixtures
test('example', async ({ test }) => {         // ← Playwright injects `test`
  await test.ui.login.loginSuccessfully(creds);       // test → ui → login → method
  await test.api.auth.authenticateSuccessfully(creds); // test → api → auth → method
});
```

### 2.2 Creation Chain

```
Playwright creates:
  page: Page
  request: APIRequestContext
  │
  ▼
TestFixture.ts (Layer 4):
  test: async ({ page, request }, use) => {
    const fixture = new TestFixture(page, request);  // ← Creates fixture
    await use(fixture);
  }
  │
  ▼
TestFixture (constructor):
  super({ page, request, environment });  // ← Passes to TestContext
  this.api = new ApiFixture(options);     // ← Creates ApiFixture with same options
  this.ui = new UiFixture(options);       // ← Creates UiFixture with same options
  │
  ▼
ApiFixture (constructor):
  super(options);                         // ← Inherits from ApiBase
  this.auth = new AuthApi(options);       // ← Creates AuthApi with same options
  this.example = new ExampleApi(options);
  │
  ▼
AuthApi (constructor):
  super(options);                         // ← Inherits from ApiBase → TestContext
```

### 2.3 Visual Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│ PLAYWRIGHT TEST RUNNER                                            │
│ Provides: { page, request }                                       │
└──────────────────────────────────────────────────────────────────┘
│
▼
┌──────────────────────────────────────────────────────────────────┐
│ test fixture                                                      │
│ TestFixture { page, request }                                     │
│ ├── api: ApiFixture { request }                                   │
│ │   ├── auth: AuthApi { request }                                 │
│ │   └── example: ExampleApi { request }                           │
│ └── ui: UiFixture { page, request }                               │
│     ├── login: LoginPage { page }                                 │
│     └── example: ExamplePage { page }                             │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Playwright Projects Configuration

### 3.1 Project Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ global-setup (teardown: 'global-teardown')                       │
│ └─ tests/setup/global.setup.ts                                   │
│   • Creates directories                                          │
│   • Validates environment                                        │
└────────────────────────┬────────────────────────────────────────┘
                         │
          ┌──────────────┴────────────┐
          ▼                           ▼
┌───────────────────┐    ┌───────────────────┐
│ ui-setup          │    │ api-setup          │
│ (depends: global) │    │ (depends: global)  │
│ ui-auth.setup.ts  │    │ api-auth.setup.ts  │
│ • Login via UI    │    │ • Login via API    │
│ • Saves token     │    │ • Saves token      │
│ • storageState    │    │ • api-state.json   │
└─────────┬─────────┘    └─────────┬─────────┘
          │                        │
          ▼                        ▼
┌───────────────────┐    ┌───────────────────┐
│ e2e               │    │ integration        │
│(depends: ui-setup)│    │(depends: api-setup)│
│ tests/e2e/**/*.ts │    │tests/integration/**│
│ storageState used │    │                    │
└───────────────────┘    └───────────────────┘
          │                        │
          └────────────┬───────────┘
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ global-teardown                                                  │
│ └─ tests/teardown/global.teardown.ts                             │
│   • Generates ATC report                                         │
│   • Sync to TMS (if AUTO_SYNC=true)                              │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Generated Authentication Files

```
.auth/
├── user.json       ← storageState (cookies, localStorage) for E2E
└── api-state.json  ← JWT token for API tests
```

---

## 4. Token Propagation (RESOLVED)

### 4.1 Current Flow (WORKING)

**Setup Files** (ui-auth.setup.ts / api-auth.setup.ts):
1. Use KATA fixtures (import test from @TestFixture)
2. Call ATCs: `ui.login.loginSuccessfully()` / `api.auth.authenticateSuccessfully()`
3. Save token to `.auth/api-state.json`
4. For UI: Also save storageState to `.auth/user.json`

**E2E/Integration Tests**:
1. `TestFixture.constructor()` calls `loadTokenFromFile()`
2. Reads `.auth/api-state.json` and extracts token
3. Calls `api.setAuthToken(token)` → propagates to all components
4. All apiGET/POST/PUT/DELETE include Authorization header

### 4.2 Token Propagation Methods

```typescript
// Automatic: When creating the fixture
const fixture = new TestFixture(page, request);
// → loadTokenFromFile() is called in constructor

// Manual: At runtime (to change user, re-login, etc.)
test.setAuthToken(newToken);   // Updates token
test.clearAuthToken();          // Clears to test unauthenticated scenarios
```

### 4.3 Key Code

```typescript
// TestFixture.ts
private loadTokenFromFile(): void {
  const apiStatePath = config.auth.apiStatePath;
  if (existsSync(apiStatePath)) {
    const apiState: ApiState = JSON.parse(readFileSync(apiStatePath, 'utf-8'));
    if (apiState.token) {
      this.api.setAuthToken(apiState.token);
    }
  }
}
```

---

## 5. ATCs and Assertions Analysis

### 5.1 Implemented ATCs

| Component | Test ID        | Method                      | Assertions                                        |
| --------- | -------------- | --------------------------- | ------------------------------------------------- |
| AuthApi   | PROJ-AUTH-001  | authenticateSuccessfully    | status=200, token defined, type=Bearer, expires>0 |
| AuthApi   | PROJ-AUTH-002  | loginWithInvalidCredentials | status=400, ok=false, error defined               |
| LoginPage | PROJ-LOGIN-001 | loginSuccessfully           | URL does not contain /login (requires goto() before) |
| LoginPage | PROJ-LOGIN-002 | loginWithInvalidCredentials | error visible, URL contains /login                |

**Note**: `getCurrentUser()` is a **helper** method (no `@atc` decorator). It is used as a verification step inside ATCs like `authenticateSuccessfully()`, not as a standalone ATC. See [test-design-principles.md](test-design-principles.md) for why GETs are always helpers.

### 5.2 Assertion Pattern (Fixed Assertions)

ATCs have fixed assertions (hardcoded in the method):

```typescript
// AuthApi.ts - authenticateSuccessfully
@atc('PROJ-AUTH-001')
async authenticateSuccessfully(credentials: Credentials): Promise<[APIResponse, TokenResponse, Credentials]> {
  const [response, body, payload] = await this.apiPOST<TokenResponse, Credentials>('/auth/login', credentials);

  // Fixed assertions - ALWAYS execute
  expect(response.status()).toBe(200);
  expect(body.access_token).toBeDefined();
  expect(body.token_type).toBe('Bearer');

  // Verification via helper
  const currentUser = await this.getCurrentUser();
  expect(currentUser.userId).toBeDefined();

  return [response, body, payload];
}
```

**Design note**: Fixed assertions validate the invariant output of an ATC. If a test needs to verify a different outcome (e.g., that access is denied), that is a different ATC with its own assertions (e.g., `loginWithInvalidCredentials`). See Equivalence Partitioning in `automation-standards.md`.

### 5.3 ATC Return Pattern

| Type     | Return Pattern                 | Example                        |
| -------- | ------------------------------ | ------------------------------ |
| API GET  | [APIResponse, TBody]           | [response, userInfo]           |
| API POST | [APIResponse, TBody, TPayload] | [response, token, credentials] |
| UI       | void (assertions inside)       | N/A                            |

---

## 6. Decorators and Tracking

### 6.1 @atc Decorator

```typescript
@atc('PROJ-AUTH-001', { softFail: false, severity: 'critical' })
async loginSuccessfully(credentials) { ... }
```

**Options:**

| Option     | Type    | Description                                                    |
| ---------- | ------- | -------------------------------------------------------------- |
| `softFail` | boolean | When `true`, ATC failure doesn't block the test flow — it only logs the failure |
| `severity` | string  | Associates criticality level to the ATC for reporting (`critical`, `high`, `medium`, `low`) |

**Functionality:**

- Wraps method in `allure.step()`
- Captures duration and result
- Console logs: `✅ [PROJ-AUTH-001] loginSuccessfully - PASS (234ms)`
- Stores in `atcResults` Map for final report
- Supports `softFail: true` to continue on error

### 6.2 Report Generation

```typescript
// In global.teardown.ts
await generateAtcReport('reports/atc_results.json');
// Output:
{
  "generatedAt": "2026-02-08T...",
  "summary": { "total": 5, "passed": 4, "failed": 1, "skipped": 0 },
  "results": { "PROJ-AUTH-001": [...], ... }
}
```

---

## 7. Data Factory

```typescript
// Access from components
this.data.createUser()         // TestUser with email, password, name
this.data.createCredentials()  // Only email + password
this.data.createHotel()        // Hotel with name, orgId, invoiceCap
this.data.createBooking()      // Booking with confirmation#, stayValue, etc.
```

**Principle**: Data is always dynamic via Faker, never static.

---

## 8. Support Files

| File                      | Purpose                                     |
| ------------------------- | ------------------------------------------- |
| config/variables.ts       | SINGLE SOURCE for env vars, URLs, credentials |
| tests/utils/decorators.ts | @atc decorator and result tracking          |
| tests/utils/allure.ts     | Helpers for Allure attachments              |
| tests/KataReporter.ts     | Custom reporter with colored output         |
| tests/data/DataFactory.ts | Data generation with Faker                  |
| tests/data/types.ts       | Interfaces for test data                    |

---

## 9. Detected Issues Status

| #   | Issue                          | Severity | Status       | Notes                                    |
| --- | ------------------------------ | -------- | ------------ | ---------------------------------------- |
| 1   | Token not propagated in E2E    | CRITICAL | RESOLVED     | TestFixture.loadTokenFromFile()          |
| 2   | Fixed assertions in ATCs       | MEDIUM   | CLARIFIED    | Intentional: ATCs = specific test cases  |
| 3   | Steps module only as example   | LOW      | PENDING      | ExampleSteps.ts is a template            |
| 4   | No real Integration tests      | LOW      | RESOLVED     | tests/integration/auth/user-session.test |

---

## 10. Implemented Changes (2026-02-08)

### 10.1 Token Propagation

- `TestFixture.loadTokenFromFile()`: Automatic token loading from `.auth/api-state.json`
- `TestFixture.setAuthToken()/clearAuthToken()`: Public methods for runtime
- `ApiFixture` also loads token in its Playwright fixture

### 10.2 Setup Files Refactored

- Now use KATA fixtures (import test from @TestFixture)
- `ui-auth.setup.ts`: Uses `ui.login.goto()` + `ui.login.loginSuccessfully()`
- `api-auth.setup.ts`: Uses `api.auth.authenticateSuccessfully()`

### 10.3 LoginPage Refactored

- `goto()` extracted from ATCs (call before the ATC)
- Private helper `fillAndSubmitLoginForm()` (combines fill + submit)
- ATCs are more atomic: only action + assertions

### 10.4 AuthApi Renamed

- `loginSuccessfully()` → `authenticateSuccessfully()` (differentiate from UI)

### 10.5 Structure Renamed

- `tests/components/preconditions/` → `tests/components/steps/`
- Alias `@preconditions/*` → `@steps/*`

### 10.6 Shared Types

- `TokenResponse` and `ApiState` in `tests/data/types.ts`
- `AuthApi` re-exports `TokenResponse` for consumers

---

## 11. Recommended Next Steps

1. Create real steps: `BookingSteps`, `ReconciliationSteps`
2. Create real E2E tests: Dashboard, Bookings, etc.
3. Add more API components: `BookingsApi`, `InvoicesApi`
4. Add more UI components: `DashboardPage`, `BookingsPage`
