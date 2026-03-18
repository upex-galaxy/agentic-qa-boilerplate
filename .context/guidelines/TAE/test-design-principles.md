# Test Design Principles

> **Purpose**: Defines the testing philosophy, ATC rules, and test structure conventions for the KATA framework.
> **Audience**: AI agents and team members writing automated tests.
> **Rule**: Always read this file before writing any test code or creating ATCs.

---

## Quick Summary

1. **ATCs are ACTIONS, not reads.** A simple GET is a helper, not an ATC.
2. **Tests validate complete FLOWS, not individual properties.** Don't create 6 tests checking 6 fields of the same response.
3. **Test names use verbs.** Files: camelCase with a verb. Tests: `should [behavior] when [condition]`.
4. **ATCs are equivalent partitions.** Same ATC with different data must produce the same type of output. Conditionals are allowed sparingly for slight output variations; truly different behavior requires a separate ATC.
5. **Assertions are micro-validations during a flow**, not standalone tests.

---

## 1. What is an ATC (and What is NOT)

### ATC = An Action in the System

An ATC (Acceptance Test Case) represents a **complete action** that changes or validates system state. It maps 1:1 with a test case ticket in your issue tracker (Jira, Xray, Coda, etc.) via the `@atc('TICKET-ID')` decorator, where the ID is the real issue ID (e.g., `TK-101`, `UPEX-456`).

**An ATC is:**
- An action the user or system performs (create, update, delete, submit, import)
- A complete mini-flow with actions + assertions
- An equivalent partition: same ATC with different inputs always produces the same output type
- Reusable across multiple tests and steps

**When is it the SAME ATC vs a DIFFERENT ATC?**

| Same ATC (parameterize) | Different ATC (create new) |
|--------------------------|---------------------------|
| Different **data** but same **behavior** | Different **actions** or **behavior** |
| All inputs produce the same output type | Outputs are fundamentally different |
| Example: buy 1 product vs buy 5 products (same checkout flow) | Example: checkout with credit card vs checkout with bank transfer (different steps) |
| Minor output variation → use conditionals sparingly | Different endpoint, different UI flow, or different assertions |

**Rule of thumb**: If the **actions** inside the ATC change, it's a different ATC. If only the **data** changes but the system behaves identically, it's the same ATC with parameterized input.

**An ATC is NOT:**
- A simple GET endpoint that retrieves data
- A single assertion on one field
- A wrapper around one Playwright action (click, fill, navigate)

### Helpers vs ATCs

| Type | What It Does | Example | Has `@atc` Decorator |
|------|-------------|---------|---------------------|
| **Helper** | Retrieves data (read-only, no state change) | `getBookings(filters)`, `getCurrentUser()` | No |
| **ATC** | Performs an action that changes system state | `authenticateSuccessfully()`, `importBookingsSuccessfully()` | Yes |

### Edge Case: Authorization/Security GETs

A GET that validates access control (e.g., `GET /admin` returning 403) is still a **helper**, not an ATC. The ATC is the action that establishes the context; the GET serves as verification inside it.

```
ATC: loginWithRestrictedRole(credentials)
  1. POST /auth/login with restricted user (the ACTION)
  2. GET /admin → expects 403            (VERIFICATION that access is denied)
  3. Assertions: 403 status, error message
```

The GET alone doesn't change system state — it only confirms the outcome of the login action. This rule applies to all authorization checks (401, 403).

### When a GET Belongs Inside an ATC

A GET is valid **inside** an ATC when it serves as a verification step after an action:

```
ATC: importBookingsSuccessfully(file)
  1. POST /bookings/import (the ACTION)
  2. GET /bookings?hotelId=X   (VERIFICATION that import worked)
  3. Assertions on both responses
```

The GET is not a standalone ATC. It exists to verify the action succeeded. This is similar to how a user would perform an action in the UI and then visually verify the result on screen.

### Incorrect ATC Examples (Should Be Helpers)

```
// WRONG: These are helpers, not ATCs
@atc('TK-103')
async getCurrentUserSuccessfully() { ... }  // Just a GET, no action

@atc('TK-104')
async getCurrentUserUnauthorized() { ... }  // Just a GET, no action
```

### Correct ATC Examples

```
// RIGHT: These are real actions in the system
@atc('TK-101')
async authenticateSuccessfully(credentials) {
  // ACTION: POST to login
  // VERIFICATION: GET /auth/me to confirm session is valid
  // ASSERTIONS: token defined, user info matches
}

@atc('TK-102')
async loginWithInvalidCredentials(credentials) {
  // ACTION: POST to login with bad creds
  // VERIFICATION: GET /auth/me returns 401 (proves session was NOT created)
  // ASSERTIONS: error response, no token, no session
}
```

Notice how `getCurrentUserOK` should be absorbed INTO `authenticateSuccessfully` as a verification step, and `getCurrentUser401` should be absorbed INTO `loginWithInvalidCredentials`.

### ATC Structure

```
ATC method:
  1. Preconditions: received via parameters (implicit, not internal setup)
  2. Actions: the actual operations (POST, PUT, clicks, form submissions)
  3. Verification: optional GET or page check to confirm the action worked
  4. Assertions: fixed assertions that validate the expected outcome
  5. Return: data for chaining ([response, body, payload] for API, void for UI)
```

### ATC Naming Convention

Format: `{verb}{Resource}{Scenario}`

- Success: `authenticateSuccessfully`, `importBookingsSuccessfully`
- Error: `loginWithInvalidCredentials`, `importBookingsWithInvalidFile`
- The name must clearly describe WHAT ACTION is being performed and WHAT OUTCOME is expected

---

## 2. Helpers in Components

Helpers are public methods in components that retrieve data without performing actions. They do NOT have the `@atc` decorator.

**Placement**: At the top of the component file, before ATCs.

```
BookingsApi.ts:
  // --- Helpers (no @atc decorator) ---
  getBookings(filters)           → GET /bookings
  getBookingById(id)             → GET /bookings/{id}
  getAggregates(filters)         → GET /bookings/aggregates
  getMonthStatus(hotelId, month) → GET /bookings/month-status

  // --- ATCs (@atc decorator) ---
  @atc('TK-201')
  importBookingsSuccessfully(file, hotelId) → POST /bookings/import + GET verification
```

Helpers can be called:
- Inside ATCs as verification steps
- Inside test files for preconditions or assertions
- Inside steps for setup chains

---

## 3. Test File Design

### File Naming

- **Format**: camelCase with a verb that describes what the test validates
- **Location**: `tests/integration/{module}/` or `tests/e2e/{module}/`

| Pattern | Example | Why |
|---------|---------|-----|
| `{verb}{Feature}.test.ts` | `attributeBookings.test.ts` | Verb makes the purpose clear |
| `{verb}{Feature}.test.ts` | `calculateCommission.test.ts` | You know exactly what it tests |
| `{verb}{Feature}.test.ts` | `refreshMonthlyData.test.ts` | Action-oriented naming |

**Avoid generic names** like `bookingAttribution.test.ts` (no verb, too broad) or `userSession.test.ts` (what about the session?).

### Describe Block

The `describe` block name should match the file purpose. It can optionally include the ticket ID when the file is tied to a single ticket:

```typescript
// File: attributeBookings.test.ts
test.describe('TK-411: Attribute Bookings', () => {
  test('TK-411: should attribute booking to newsletter when guest books within window', ...)
  test('TK-411: should mark guest as repeat when EmailHash exists at same hotel', ...)
  test('TK-411: should NOT mark guest as repeat when EmailHash exists at different hotel', ...)
});
```

### Test Naming Convention

Every `test()` must have the ticket ID as a prefix, followed by the behavior description.

Format: `TK-XXX: should [behavior] when [condition]`

| Component | Purpose | Example |
|-----------|---------|---------|
| `should` | Always starts with "should" | `should` |
| `[behavior]` | Verb + expected outcome | `attribute booking to newsletter` |
| `when [condition]` | The specific scenario | `when guest books within attribution window` |

More examples:
- `should calculate commission correctly when booking is commissionable`
- `should set IsCommissionable to false when EmailHash exists in history`
- `should NOT count repeat guest across different hotels`
- `should apply InvoiceCapDiscount when commission exceeds cap`
- `should reject state transition when skipping from State 1 to State 3`

---

## 4. Tests Validate FLOWS, Not Individual Properties

### The Anti-Pattern (WRONG)

```typescript
// WRONG: 6 tests checking 6 properties of the same response
test('should return bookings', async ({ api }) => {
  const bookings = await api.bookings.getBookings(filters);
  expect(bookings.length).toBeGreaterThan(0);
});

test('should have newsletterId', async ({ api }) => {
  const bookings = await api.bookings.getBookings(filters);  // same call!
  expect(bookings[0].newsletterId).toBeDefined();
});

test('should have isCommissionable', async ({ api }) => {
  const bookings = await api.bookings.getBookings(filters);  // same call again!
  expect(bookings[0].isCommissionable).toBe(false);
});
```

This is wrong because:
- All 3 tests make the same API call
- All 3 tests check the same response
- If one fails, the others probably fail too
- No value in separating them

### The Correct Approach

```typescript
// RIGHT: One test validates the complete flow with multiple assertions
test('TK-XXX: should attribute booking to newsletter when guest books within window', async ({ api }) => {
  // Preconditions
  // ... setup data via API

  // Action + Verification (through ATCs and helpers)
  const bookings = await api.bookings.getBookings(filters);
  const aggregates = await api.bookings.getAggregates(filters);

  // Multiple assertions validating the COMPLETE contract
  expect(bookings.length).toBeGreaterThan(0);
  expect(bookings[0].newsletterId).toBeDefined();
  expect(bookings[0].isCommissionable).toBeDefined();
  expect(aggregates.totalCommission).toBeGreaterThan(0);
  // ... all related validations in one place
});
```

### When to Separate Tests

Only create separate tests when the **scenario is fundamentally different**:

| Separate Test? | Reason |
|---------------|--------|
| Yes | Different flow (positive vs negative) |
| Yes | Different preconditions that change the outcome |
| Yes | Different user role or permissions |
| No | Same flow, different field assertions |
| No | Same response, different property checks |

Example of correctly separated tests:

```typescript
test.describe('TK-411: Detect Repeat Guests', () => {
  // Scenario 1: Guest IS a repeat (different precondition → different outcome)
  test('TK-411: should mark as non-commissionable when EmailHash exists at same hotel', ...)

  // Scenario 2: Guest is NOT a repeat (different precondition → different outcome)
  test('TK-411: should mark as commissionable when guest is new to hotel', ...)

  // Scenario 3: Cross-hotel check (different precondition → different outcome)
  test('TK-411: should NOT mark as repeat when EmailHash exists at different hotel', ...)
});
```

Each test here has a genuinely different scenario, different preconditions, and a different expected outcome.

---

## 5. Assertions Are Micro-Validations During a Flow

Assertions are NOT the purpose of a test. They are **checkpoints** along a flow.

Think of it like this:
- The TEST is the journey (the complete flow)
- ASSERTIONS are road signs along the way (confirming you're on the right path)
- ATCs contain their own assertions (confirming each action succeeded)
- Test-level assertions verify the overall outcome after the flow completes

### Assertion Layers

```
Test Flow
  │
  ├── ATC 1: importBookingsSuccessfully()
  │     └── [ATC assertions: status 200, bookings created]
  │
  ├── ATC 2: calculateCommissionSuccessfully()
  │     └── [ATC assertions: commission > 0, rate applied]
  │
  └── Test-level assertions:
        └── [Final state: total matches sum, cap applied correctly]
```

The ATC assertions validate that each individual action worked. The test-level assertions validate the overall outcome of combining multiple actions.

---

## 6. Test Files vs ATCs: What Lives Where

### The Relationship

```
TMS (Coda)                          Code (KATA)
──────────                          ──────────
Test Case ticket (TK-XXX)    ───►   @atc('TK-XXX') method in a Component
                                      │
Integration/E2E ticket (TK-YYY) ─►   test() block in a Test File
                                      │ calls multiple ATCs
                                      └──► ATC 1 + ATC 2 + ATC 3 = complete flow
```

### ATCs = Lego Pieces

ATCs are reusable blocks of actions. They live in **components** (Layer 3) and represent individual acceptance test cases tracked in the TMS. Each ATC has a ticket ID via `@atc('TK-XXX')` and reports its own pass/fail status independently.

### Test Files = Assembled Scenarios

Test files combine ATCs (and helpers) to form **complete scenarios** — integration or E2E flows. A single test may call multiple ATCs. When the test runs, each ATC reports its own result, giving granular visibility into what passed and what failed within the flow.

```
Test File: detectRepeatGuests.test.ts
  │
  └── test('TK-YYY: should mark as non-commissionable when repeat guest')
        │
        ├── [preconditions via helpers]
        ├── ATC: importBookingsSuccessfully()    → TK-101 (pass/fail)
        ├── ATC: processBookingsSuccessfully()   → TK-102 (pass/fail)
        └── [test-level assertions on final state]
```

If `TK-102` fails, the test fails — but the report shows that `TK-101` passed and `TK-102` failed, making debugging precise.

### Traceability in the TMS

The TMS tracks both levels:

| TMS Artifact | Maps To | Example |
|-------------|---------|---------|
| Test Case ticket | `@atc('TK-XXX')` in a component | `TK-101: Import bookings successfully` |
| Integration/E2E ticket | `test()` block in a test file | `TK-411: Detect repeat guests` |

Both are tickets in Coda, but they serve different purposes. Test cases validate individual actions. Integration/E2E tickets validate complete flows that combine those actions.

### Ticket ID as Prefix (Required)

Every `test()` block must include the ticket ID as a prefix for direct traceability:

```typescript
// Format: 'TK-XXX: should [behavior] when [condition]'
test('TK-411: should mark as non-commissionable when EmailHash exists at same hotel', ...)
test('TK-411: should mark as commissionable when guest is new to hotel', ...)
```

The `describe` block can optionally include the ticket ID when the entire file is associated with a single ticket:

```typescript
test.describe('TK-411: Detect Repeat Guests', () => { ... });
```

This ensures that every test result in the report can be traced back to its corresponding ticket in the TMS.

---

## 7. Preconditions Strategy

Each test sets up its own data via API or DB before executing the test scenario:

```
Test Execution Flow:
  1. Preconditions: Manipulate Demo Hotel data via API/DB to create the scenario
  2. Actions: Perform the test steps (API calls or UI interactions)
  3. Assertions: Validate the expected behavior with the given data
```

Rules:
- Each test case creates its own scenario independently
- Tests must NOT depend on or interfere with other tests
- Preconditions are set via API endpoints or DB connection
- The Demo Hotel is the shared resource, but data within it is managed per-test

---

## 8. Integration vs E2E Test Design

| Aspect | Integration Test | E2E Test |
|--------|-----------------|----------|
| **Scope** | API endpoint chain (2-3 endpoints) | Full user journey (UI + API) |
| **Speed** | Fast (no browser) | Slower (browser required) |
| **Fixture** | `({ api })` | `({ ui })` or `({ test })` or `({ steps })` |
| **Preconditions** | API calls | API calls (setup) + UI (action) |
| **Value** | Validates business logic correctness | Validates user experience |

Both follow the same principles:
- Complete flows, not isolated checks
- ATCs for actions, helpers for reads
- Multiple assertions per test
- Separate tests only for different scenarios
