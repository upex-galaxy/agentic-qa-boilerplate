# Exploratory API Testing Session

> AI-guided exploratory testing at the API layer using API exploration and execution tools.

---

## Purpose

Execute exploratory testing on API endpoints to validate backend functionality, verify data contracts, test authentication flows, and discover integration defects before automation.

> **TCs as Guides**: If Test Cases exist from Stage 1 planning, use them as a guide but explore freely. Update TC statuses (PASSED/FAILED) as you validate. Discovering new scenarios beyond the TCs is expected and encouraged.

**This prompt is executed AFTER:**

- Smoke test passed (deployment is functional)
- Feature is deployed to staging
- API endpoints are accessible

**When to use API Exploratory Testing:**

- Testing endpoints that don't have UI yet
- Validating API contracts (request/response schemas)
- Testing authentication and authorization (RLS policies)
- Verifying data transformations and business logic
- Testing error handling and edge cases at API level

---

## Prerequisites

**Capabilities Required:**

| Capability                       | Tag                    | Required |
| -------------------------------- | ---------------------- | -------- |
| Execute authenticated API flows  | `[API_TOOL]`           | Yes      |
| Explore endpoints, schema validation | `[API_TOOL]`       | Optional |
| Verify data after API operations | `[DB_TOOL]`            | Optional |
| Bug creation, story transitions  | `[ISSUE_TRACKER_TOOL]` | Optional |

> Resolved via respective tags — see Tool Resolution in CLAUDE.md

**Environment:**

- Staging URL accessible
- Test user credentials available

---

## Input Required

### Option 1: Shift-Left Test Cases (Recommended)

If the project has Shift-Left Testing documentation:

```
Provide:
- Path to acceptance-test-plan.md file
- OR Jira issue with test cases in comments
- OR test cases directly in the prompt
```

### Option 2: Acceptance Criteria

If no Shift-Left documentation exists:

```
Provide:
- User Story ID (e.g., MYM-123)
- OR path to story.md file
- OR acceptance criteria directly in the prompt
```

### Option 3: API Contract/OpenAPI Spec

For contract-focused exploration:

```
Provide:
- OpenAPI spec URL or file path
- Specific endpoints to test
- Expected request/response schemas
```

---

## Workflow

### Phase 1: Context Gathering

**Actions:**

1. **Read test requirements** from the provided input
2. **Identify API endpoints** to explore:
   - Endpoints involved in the User Story
   - Related endpoints (dependencies)
   - Authentication endpoints (if auth is involved)
3. **Determine exploration scope:**
   - CRUD operations to test
   - Authentication scenarios
   - Error conditions to verify
   - Data validation rules

**Output to user:**

```markdown
## API Exploration Plan

**Feature:** [Feature name]
**Scope:** [US/Epic being tested]
**Base URL:** [API Base URL]

### Endpoints to Explore:

| Method | Endpoint          | Purpose             |
| ------ | ----------------- | ------------------- |
| POST   | /auth/v1/token    | User authentication |
| GET    | /rest/v1/products | List products       |
| POST   | /rest/v1/orders   | Create order        |
| ...    | ...               | ...                 |

### Test Scenarios:

1. [Scenario 1 - Happy path]
2. [Scenario 2 - Auth required]
3. [Scenario 3 - Error handling]
   ...

Shall I proceed with the API exploration?
```

---

### Phase 2: Authentication Setup

**If testing authenticated endpoints:**

```
[API_TOOL] Setup environment:
  - variables: base_url, anon_key, access_token, test_user_email, test_user_password

[API_TOOL] Execute login:
  - endpoint: /auth/v1/token
  - method: POST
  - credentials: {from .env}

[API_TOOL] Store access_token for subsequent requests
```

> Resolved via [API_TOOL] — see Tool Resolution in CLAUDE.md

**Authentication Test Cases:**

```markdown
### Auth Scenario: Valid Login

**Request:**
POST /auth/v1/token?grant_type=password
Body: { "email": "test@example.com", "password": "xxx" }

**Expected:**

- Status: 200
- Response contains: access_token, refresh_token, user.id

**Actual:** [Document result]
**Status:** [PASSED/FAILED]
```

---

### Phase 3: API Exploration

**For each endpoint/scenario:**

**For each endpoint:**

```
[API_TOOL] Explore available endpoints:
  - action: list endpoints or inspect schema

[API_TOOL] Execute request:
  - method: {from test scenario}
  - endpoint: {from test scenario}
  - headers: {from auth setup}
  - body: {from test scenario}

Validate response:
  - Status code matches expected
  - Response body schema is correct
  - Data values are accurate
  - Headers are appropriate

Document findings
```

> Resolved via [API_TOOL] — see Tool Resolution in CLAUDE.md

**Test Documentation Format:**

```markdown
### Scenario: [Name]

**Endpoint:** [METHOD] [PATH]

**Request:**

- Headers: [List headers]
- Body: [Request body if applicable]
- Query params: [If applicable]

**Expected Response:**

- Status: [Expected status code]
- Body: [Expected structure/values]

**Actual Response:**

- Status: [Actual status code]
- Body: [Actual response - summarized]

**Assertions:**

- [ ] Status code matches
- [ ] Response schema is valid
- [ ] Data values are correct
- [ ] No unexpected fields

**Outcome:** [PASSED / FAILED / OBSERVATION]

**Notes:**

- [Any observations]
```

---

### Phase 4: RLS Policy Testing

**Critical for Supabase projects:**

Test that Row Level Security policies work correctly:

```markdown
### RLS Test: User can only see own orders

**Setup:**

- Login as User A (get token_A)
- Login as User B (get token_B)

**Test 1: User A requests their orders**
GET /rest/v1/orders (with token_A)
Expected: Only User A's orders
Actual: [Result]

**Test 2: User A tries to access User B's orders**
GET /rest/v1/orders?user_id=eq.[user_b_id] (with token_A)
Expected: Empty array (RLS filters out)
Actual: [Result]

**Test 3: User A tries to update User B's data**
PATCH /rest/v1/users?id=eq.[user_b_id] (with token_A)
Expected: No rows affected (RLS blocks)
Actual: [Result]

**RLS Status:** [WORKING / VULNERABLE]
```

---

### Phase 5: Error Handling & Edge Cases

**Test Categories:**

#### 1. Input Validation

```markdown
### Edge Case: Empty required field

**Request:** POST /rest/v1/products
Body: { "name": "", "price": 100 }

**Expected:** 400 Bad Request with validation error
**Actual:** [Result]
**Status:** [PASSED/FAILED]
```

#### 2. Authentication Errors

```markdown
### Edge Case: Expired token

**Request:** GET /rest/v1/orders
Headers: Authorization: Bearer [expired_token]

**Expected:** 401 Unauthorized
**Actual:** [Result]
**Status:** [PASSED/FAILED]
```

#### 3. Not Found Scenarios

```markdown
### Edge Case: Non-existent resource

**Request:** GET /rest/v1/products?id=eq.non-existent-uuid

**Expected:** 200 with empty array (PostgREST behavior)
**Actual:** [Result]
**Status:** [PASSED/FAILED]
```

#### 4. Boundary Testing

```markdown
### Edge Case: Maximum field length

**Request:** POST /rest/v1/reviews
Body: { "comment": "[10000 character string]", ... }

**Expected:** Either accepted or 400 with length error
**Actual:** [Result]
**Status:** [PASSED/FAILED]
```

---

### Phase 6: Data Verification (Optional)

**After API operations, verify data in database:**

```markdown
### Data Verification: Order Creation

**API Action:**
POST /rest/v1/orders → Created order ID: abc123

**DB Verification:**

1. Verify order exists:
   SELECT * FROM orders WHERE id = 'abc123'
   Result: [Found/Not Found]

2. Verify order items:
   SELECT COUNT(*) FROM order_items WHERE order_id = 'abc123'
   Result: [Count matches expected]

3. Verify triggers executed:
   SELECT total FROM orders WHERE id = 'abc123'
   Result: [Total calculated correctly by trigger]

**Data Integrity:** [VERIFIED / DISCREPANCY FOUND]
```

---

### Phase 7: Session Summary

**Generate comprehensive API testing notes:**

```markdown
# API Exploratory Testing Session Notes

**Date:** [Date]
**Feature:** [Feature/US being tested]
**API Base URL:** [URL]
**Duration:** [Time spent]

---

## Executive Summary

- **Overall Status:** [PASSED / ISSUES FOUND / BLOCKED]
- **Endpoints Tested:** [X endpoints]
- **Scenarios Executed:** [X of Y]
- **Issues Found:** [Number]
- **RLS Policies:** [VERIFIED / NOT TESTED / VULNERABLE]

---

## Authentication Testing

| Scenario         | Status | Notes       |
| ---------------- | ------ | ----------- |
| Valid login      | PASSED | -           |
| Invalid password | PASSED | Returns 400 |
| Expired token    | PASSED | Returns 401 |
| Missing auth     | PASSED | Returns 401 |

---

## Endpoint Testing

### 1. GET /rest/v1/products - [PASSED]

- Happy path: Works correctly
- Filtering: eq, like, order work
- Pagination: limit/offset work

### 2. POST /rest/v1/orders - [FAILED]

- Happy path: Works
- **Issue:** Missing validation for negative quantities
- Edge case: Duplicate order prevention not working

---

## RLS Policy Testing

| Policy                    | Status     | Notes                   |
| ------------------------- | ---------- | ----------------------- |
| Users see own orders      | VERIFIED   | -                       |
| Users can't update others | VERIFIED   | -                       |
| Admins see all orders     | NOT TESTED | No admin user available |

---

## Issues Found

### Issue 1: [Title]

- **Severity:** [Critical/High/Medium/Low]
- **Endpoint:** [METHOD] [PATH]
- **Request:** [How to reproduce]
- **Expected:** [Expected behavior]
- **Actual:** [Actual behavior]
- **Impact:** [Business impact]

---

## Observations & Recommendations

### Positive Findings:

- [What worked well]

### Areas of Concern:

- [Potential issues to monitor]

### Recommendations for Automation:

- [API tests that should be automated]
- [Integration tests to add]

---

## Next Steps

- [ ] Report critical bugs (use bug-report.md)
- [ ] Verify data integrity with DB testing (if needed)
- [ ] Transition US status if PASSED
- [ ] Proceed to Test Documentation phase
```

---

## Decision Point

After API exploration, decide:

| Result           | Action                                                        |
| ---------------- | ------------------------------------------------------------- |
| **PASSED**       | Proceed to DB verification (optional) or UI testing           |
| **ISSUES FOUND** | Use `bug-report.md` for each issue, wait for fixes            |
| **BLOCKED**      | Report blocker, do not proceed                                |
| **RLS ISSUE**    | Critical security bug - report immediately with high priority |

---

## Tool Capabilities Reference

### API Exploration & Execution (`[API_TOOL]`)

| Capability                  | Use Case                            |
| --------------------------- | ----------------------------------- |
| List collections/endpoints  | Discover available API resources    |
| Inspect endpoint schema     | View request/response schema        |
| Execute GET request         | Retrieve resources                  |
| Execute POST request        | Create resources                    |
| Execute PATCH request       | Update resources                    |
| Execute full test flow      | Run collection or sequence          |
| Manage environments         | Set up/update test environment      |

> Resolved via [API_TOOL] — see Tool Resolution in CLAUDE.md

---

## Best Practices

1. **Test auth first** - Many issues stem from authentication problems
2. **Verify RLS policies** - Critical for multi-tenant apps
3. **Check response schemas** - Don't just check status codes
4. **Test with different users** - Verify role-based access
5. **Document exact requests** - Makes bug reproduction easier
6. **Combine with DB verification** - API might return success but data is wrong
7. **Test error messages** - Users see these, they should be helpful

---

## Integration with Triforce Testing

This API testing is one part of complete feature validation:

```
┌─────────────────────────────────────────────────────────────┐
│                    TRIFORCE TESTING                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │     UI      │  │     API     │  │     DB      │         │
│  │  Testing    │  │  Testing    │  │  Testing    │         │
│  │             │  │   (THIS)    │  │             │         │
│  │ [AUTOMATION │  │  [API_TOOL] │  │ [DB_TOOL]   │         │
│  │    _TOOL]   │  │             │  │             │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│        │                │                │                  │
│        └────────────────┴────────────────┘                  │
│                         │                                   │
│              Complete Feature Validation                    │
└─────────────────────────────────────────────────────────────┘
```

**Recommended flow:**

1. **API Testing** - Validate backend logic works
2. **DB Testing** - Verify data integrity
3. **UI Testing** - Confirm user experience

---

## Output

- API testing session notes with all findings
- RLS policy verification results
- List of issues (if any) ready for bug reporting
- Recommendations for automation and documentation
