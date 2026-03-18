# ATC Definition Strategy

> **Purpose**: How to define, name, and document Acceptance Test Cases (ATCs) from the QA perspective, ensuring traceability from Jira to code.
> **Audience**: QA Engineers and AI agents working on test documentation (Stage 3) and test automation (Stage 4).
> **Rule**: Read this before creating test cases in Jira or implementing ATCs in code.

---

## Quick Summary

1. **ATCs originate in Jira** as test cases during Stage 3 (Test Documentation)
2. **ATCs are implemented in code** via the `@atc('TK-XXX')` decorator in KATA components
3. **An ATC = one acceptance criterion** — a short, precise action with a verifiable outcome
4. **E2E and Integration tests combine multiple ATCs** into complete flows
5. **Traceability is end-to-end**: Jira ticket ↔ `@atc` decorator ↔ test report ↔ back to Jira

---

## 1. What is an ATC?

An **Acceptance Test Case (ATC)** is the smallest testable unit of acceptance: a complete action with a verifiable outcome. It is NOT a full user journey — it is one step in that journey.

```
User Journey (E2E test):  Login → Search → Add to Cart → Checkout → Confirm
                            ↑        ↑          ↑            ↑          ↑
ATCs:                     ATC-1    ATC-2      ATC-3        ATC-4      ATC-5
```

Each ATC:
- Represents a **single acceptance criterion** of a User Story
- Has a **unique expected output** (Equivalence Partitioning)
- Is **reusable** across multiple E2E/Integration tests
- Maps **1:1** to a test case ticket in Jira via `@atc('TK-XXX')`

### ATC vs E2E Test vs Integration Test

| Concept | What it is | Where it lives | Example |
|---------|-----------|----------------|---------|
| **ATC** | Single action + verification | `@atc('TK-XXX')` method in a Component | `authenticateSuccessfully()` |
| **E2E Test** | Complete user journey combining multiple ATCs | `test()` block in a `.test.ts` file | Login → Navigate → Create Booking → Verify |
| **Integration Test** | API endpoint chain (2-3 endpoints) | `test()` block in a `.test.ts` file | POST /bookings → GET /bookings → Assert |

### Analogy: Xray Shared Steps

ATCs are conceptually similar to **Shared Steps** in Xray or **Pre-steps** in other TMS tools. They are reusable building blocks that can be composed into larger test scenarios.

---

## 2. The Pipeline: From Jira to Code

```
Stage 3: Test Documentation (QA)              Stage 4: Automation (TAE)
═══════════════════════════════               ═══════════════════════════

[1] Test Analysis                             [5] Component Creation
    • Identify regression candidates              • Create Page/Api components
    • Classify by priority                        • Implement ATCs with @atc decorator
    • Map reusable components                     • Fixed assertions inside ATCs
         ↓
[2] Test Prioritization                       [6] Test File Creation
    • ROI calculation                             • Combine ATCs into test scenarios
    • Risk-based filtering                        • test('TK-YYY: should...')
    • Decision: automate / manual / defer         • Test-level assertions
         ↓
[3] Test Documentation                        [7] Traceability
    • Create Test tickets in Jira                 • @atc('TK-XXX') links to Jira
    • High-quality Gherkin format                 • Test reports sync back to Jira
    • Variables pattern (no hardcoded data)        • Each ATC pass/fail tracked
    • Link to User Story
         ↓
[4] Workflow Transition
    • DRAFT → IN DESIGN → READY
    • READY → CANDIDATE (for automation)
    • CANDIDATE → Stage 4
```

### IQL Methodology Context

This pipeline is part of the **Integrated Quality Lifecycle (IQL)** Mid-Game phase:

| IQL Phase | Steps | Focus |
|-----------|-------|-------|
| Early-Game (Prevention) | 1-4 | Requirement analysis, risk assessment, BDD |
| **Mid-Game (Detection)** | **5-9** | **Test Documentation → Automation → CI** |
| Late-Game (Observation) | 10-15 | Production monitoring, canary releases |

For full IQL details, see `docs/methodology/IQL-methodology.md`.

---

## 3. How to Define an ATC

### Step 1: Start from User Story Acceptance Criteria

Each acceptance criterion is a potential ATC:

```
User Story: US-101 - User Authentication
Acceptance Criteria:
  AC1: User can log in with valid credentials     → ATC: authenticateSuccessfully
  AC2: Invalid credentials show error message      → ATC: loginWithInvalidCredentials
  AC3: Locked account shows specific error         → ATC: loginWithLockedAccount
```

### Step 2: Apply Testing Techniques

#### Equivalence Partitioning

Group inputs that produce the **same behavior** into one ATC:

```
Invalid credentials (all produce 401 error):
  - Wrong email           ┐
  - Wrong password         ├─→ ONE ATC: loginWithInvalidCredentials(payload)
  - Empty fields           ┘   (parameterized, same output)

Different behavior (different outcomes):
  - Locked account → 423  ─→ SEPARATE ATC: loginWithLockedAccount
  - Expired token → 401   ─→ Could be same ATC if same error behavior
```

#### Boundary Value Analysis

Identify boundaries that change system behavior:

```
Password field:
  - 0 characters (empty)     → ATC: loginWithInvalidCredentials (empty partition)
  - 1-7 characters (too short) → ATC: loginWithInvalidCredentials (short partition)
  - 8-64 characters (valid)  → ATC: authenticateSuccessfully
  - 65+ characters (too long) → ATC: loginWithInvalidCredentials (long partition)
```

If all invalid password lengths produce the same error → one parameterized ATC.
If different lengths produce different errors → separate ATCs.

#### Risk-Based Analysis

Prioritize ATCs by regression risk:

| Factor | Weight | How to assess |
|--------|--------|---------------|
| Prior bugs in this area | HIGH | Check closed bug tickets linked to the story |
| Business criticality | HIGH | Revenue impact, user-facing, core flow |
| Frequency of change | MEDIUM | How often this code changes |
| Complexity | MEDIUM | Number of integrations, edge cases |

### Step 3: Determine ATC Type

| ATC Type | When to use | Example |
|----------|------------|---------|
| **Action ATC** | State-changing operation (POST, PUT, DELETE, form submit) | `createBookingSuccessfully` |
| **Error ATC** | Same action but with invalid input → error response | `createBookingWithInvalidData` |
| **NOT an ATC** | Read-only GET, single UI check, navigation alone | `getBookings()` → this is a **helper** |

**Key rule**: A simple GET endpoint is a **helper**, not an ATC. See `test-design-principles.md` for details.

### Step 4: Name the ATC

**Format in Jira**: `{TS_ID or US_ID}: TC#: Validate <CORE> <CONDITIONAL>`

| Component | What it is | Example |
|-----------|-----------|---------|
| `TS_ID` / `US_ID` | Test Set or User Story ID | `GX-150`, `US-101` |
| `TC#` | Sequential number | `TC1`, `TC2` |
| `CORE` | Main behavior (verb + object) | `successful login`, `booking creation` |
| `CONDITIONAL` | Unique condition | `with valid credentials`, `when data is invalid` |

**Examples**:
- `US-101: TC1: Validate successful login with valid credentials`
- `US-101: TC2: Validate authentication error when credentials are invalid`
- `US-101: TC3: Validate account lockout after 5 failed attempts`

**Format in Code** (KATA): `{verb}{Resource}{Scenario}`

| Jira Test Case | Code ATC Method |
|---------------|-----------------|
| `TC1: Validate successful login with valid credentials` | `authenticateSuccessfully(credentials)` |
| `TC2: Validate authentication error when credentials are invalid` | `loginWithInvalidCredentials(credentials)` |
| `TC3: Validate account lockout after 5 failed attempts` | `loginWithLockedAccount(credentials)` |

---

## 4. How to Document an ATC in Jira

### Prerequisites

- User Story must be **QA Approved** (exploratory testing completed)
- All tests already **passed** during exploratory testing
- We are NOT designing new tests — we are formalizing already-validated tests
- Tests must pass the **prioritization filter** (ROI > threshold)

### Test Case Format (Gherkin)

Use high-quality Gherkin with **variables** (never hardcoded data):

```gherkin
@critical @regression @automation-candidate @US-101
Scenario Outline: Validate successful login with valid credentials
  """
  Related Story: US-101
  Priority: Critical
  ROI Score: 8.5
  """

  # === PRECONDITIONS ===
  Given a user exists with <role> role and <status> status
  And the user has valid credentials

  # === ACTION ===
  When the user navigates to "/login"
  And the user enters valid email and password
  And the user submits the login form

  # === VALIDATIONS ===
  Then the user is redirected to the dashboard
  And the authentication token is present
  And the user profile information is accessible

  # === EQUIVALENT PARTITIONS ===
  Examples: Standard user
    | role  | status   |
    | user  | active   |

  Examples: Admin user
    | role  | status   |
    | admin | active   |
```

### Variables Pattern (MANDATORY)

**Never hardcode data in test cases.** Use variables that describe data TYPE, not specific values:

| Variable | Description | How to obtain |
|----------|-------------|---------------|
| `{user_id}` | UUID of existing user | Query DB or create test user |
| `{N}` | Quantity of elements | Count in DB or define in setup |
| `{role}` | User role | Defined per equivalent partition |

```gherkin
# ❌ WRONG - Hardcoded
Given a user exists with ID "550e8400-e29b-41d4-a716-446655440000"

# ✅ CORRECT - Variable pattern
Given a user exists with {user_id} in the database
```

**Rationale**: Tests execute repeatedly throughout the project life. Data changes, gets destroyed, or rotates. Variables ensure tests remain valid regardless of environment state.

### Workflow States

```
DRAFT → IN DESIGN → READY → CANDIDATE → (Stage 4: Automated)
                           → MANUAL    → (Manual regression suite)
```

| State | Meaning |
|-------|---------|
| DRAFT | Ticket created, no steps yet |
| IN DESIGN | Steps being documented |
| READY | Approved, ready to use |
| CANDIDATE | Approved for automation (flows to Stage 4) |
| MANUAL | Not automatable, manual regression only |

### Linking and Traceability

Every test ticket MUST link to:
- **User Story**: `"tests"` / `"is tested by"` relationship
- **Bugs** (if prior bugs exist): `"is blocked by"` relationship
- **Regression Epic**: As parent or linked epic

---

## 5. From Documentation to Code

When a test case reaches **CANDIDATE** status, TAE implements it in KATA:

### Mapping

```
Jira Test Case                    KATA Code
══════════════                    ═════════
Ticket ID: TK-101          →     @atc('TK-101')
Summary: "Validate                async authenticateSuccessfully(credentials) {
  successful login"         →       // ACTION: POST /auth/login
Gherkin steps               →       // VERIFICATION: GET /auth/me
  (Action + Validations)    →       // ASSERTIONS: token, status, user info
                                    return [response, body, payload];
                                  }
```

### Traceability Chain

```
Jira: TK-101 (Test Case)
  ↓ "is tested by" link
Code: @atc('TK-101') authenticateSuccessfully()
  ↓ decorator captures pass/fail
Report: atc_results.json → { "TK-101": "PASSED" }
  ↓ TMS sync (Xray CLI)
Jira: TK-101 updated with latest execution result
```

### What the Decorator Provides

```typescript
@atc('TK-101', { softFail: false, severity: 'critical' })
async authenticateSuccessfully(credentials: Credentials) { ... }
```

- `'TK-101'`: Links to Jira ticket for traceability
- `softFail`: When `true`, failure doesn't block test flow (just logs)
- `severity`: Criticality level for reporting (`critical`, `high`, `medium`, `low`)

The decorator automatically:
- Wraps the method in an Allure step
- Captures duration and result (pass/fail)
- Logs: `✅ [TK-101] authenticateSuccessfully - PASS (234ms)`
- Stores result for the final ATC report

---

## 6. Testing Techniques Reference

### Equivalence Partitioning (EP)

Divide input domain into classes where the system behaves identically. One ATC per class.

```
Login inputs:
  Valid partition    → authenticateSuccessfully (200)
  Invalid partition  → loginWithInvalidCredentials (401)
  Locked partition   → loginWithLockedAccount (423)
```

### Boundary Value Analysis (BVA)

Test at the edges of equivalence classes:

```
Password length:
  7 chars (just below minimum)  → invalid partition
  8 chars (at minimum boundary) → valid partition
  64 chars (at maximum)         → valid partition
  65 chars (just above maximum) → invalid partition
```

### Risk-Based Testing

Prioritize ATCs by regression risk:

```
ROI = (Frequency × Impact × Stability) / (Effort × Dependencies)

ROI > 5.0  → Automate (excellent ROI)
3.0 - 5.0  → Automate with caution
1.5 - 3.0  → Evaluate case by case
< 1.5      → Defer (not worth maintaining)
```

### Component Value Bonus (Reusability)

ATCs that are reused in many E2E flows get a value bonus:

```
Component Value = Base ROI × (1 + 0.2 × N)
Where N = number of E2E flows that use this ATC

Example:
  "authenticateSuccessfully" used in 8 E2E flows
  Base ROI = 2.0
  Component Value = 2.0 × (1 + 0.2 × 8) = 2.0 × 2.6 = 5.2 → Automate
```

---

## 7. Anti-Patterns

| Anti-Pattern | Why it's wrong | Correct approach |
|-------------|---------------|-----------------|
| One ATC per field check | 6 ATCs checking 6 fields of same response | One ATC with multiple assertions |
| GET-only ATC | A simple read is not an action | Make it a helper method |
| Hardcoded test data | Data changes across environments | Use variables pattern |
| ATC without Jira ticket | No traceability | Always create ticket first |
| Documenting before QA Approved | Testing untested functionality | Complete exploratory testing first |
| 3 ATCs with same output (401) | Violates equivalence partitioning | One parameterized ATC |
| Automating everything | Low ROI tests waste maintenance | Apply strict prioritization filter |

---

## References

- **Test Design Principles** (source of truth for ATC rules): `.context/guidelines/TAE/test-design-principles.md`
- **KATA Architecture**: `.context/guidelines/TAE/kata-architecture.md`
- **Automation Standards**: `.context/guidelines/TAE/automation-standards.md`
- **IQL Methodology**: `docs/methodology/IQL-methodology.md`
- **Jira Test Management**: `.context/guidelines/QA/jira-test-management.md`
- **TMS Integration**: `.context/guidelines/TAE/tms-integration.md`
