# API Exploratory Testing Session

> AI-guided API exploratory testing using Postman MCP or direct HTTP tools.

---

## Purpose

Execute exploratory testing on API endpoints to validate contracts, discover edge cases, and identify potential defects before automation.

**This prompt is executed AFTER:**

- Smoke test passed (deployment is functional)
- API endpoints are deployed to staging

**Prerequisites:**

- Access to Postman MCP tools (`mcp__postman__*`) OR HTTP client
- API base URL accessible
- API documentation or OpenAPI spec available
- Test cases or acceptance criteria as input

---

## Input Required

### Option 1: OpenAPI/Swagger Spec (Recommended)

If the project has API documentation:

```
Provide:
- Path to openapi.yaml or swagger.json
- OR URL to Swagger UI
- OR API documentation link
```

### Option 2: Endpoint List

If no formal spec exists:

```
Provide:
- List of endpoints to test
- Base URL for staging
- Authentication method (if any)
```

### Option 3: User Story Context

For story-specific testing:

```
Provide:
- User Story ID (e.g., PROJ-123)
- Expected API calls for the feature
- Related backend changes
```

---

## Workflow

### Phase 1: Context Gathering

**Actions:**

1. **Read API documentation** from provided input
2. **Identify key endpoints** to explore:
   - CRUD operations (Create, Read, Update, Delete)
   - Authentication flows
   - Business logic endpoints
3. **Determine exploration scope:**
   - Request/response contracts
   - Error handling
   - Edge cases and boundaries

**Output to user:**

```markdown
## API Exploration Plan

**API Base URL:** [URL]
**Authentication:** [Method]
**Scope:** [Feature/Story being tested]

### Endpoints to Explore:

| Method | Endpoint        | Purpose           |
| ------ | --------------- | ----------------- |
| GET    | /api/resource   | List resources    |
| POST   | /api/resource   | Create resource   |
| PUT    | /api/resource/1 | Update resource   |
| DELETE | /api/resource/1 | Delete resource   |

Shall I proceed with the exploration?
```

---

### Phase 2: API Exploration

**Tools to use (Postman MCP):**

| Tool                                | Purpose                    |
| ----------------------------------- | -------------------------- |
| `mcp__postman__send_api_request`    | Execute API requests       |
| `mcp__postman__get_collection`      | Load Postman collection    |
| `mcp__postman__get_environment`     | Load environment variables |

**For each endpoint:**

1. **Happy Path Test:**
   - Valid request with expected data
   - Verify response status (200, 201, etc.)
   - Validate response schema

2. **Error Handling:**
   - Invalid authentication
   - Missing required fields
   - Invalid data types
   - Non-existent resources

3. **Edge Cases:**
   - Empty payloads
   - Maximum size payloads
   - Special characters in strings
   - Boundary values for numbers

**Session Notes Format:**

```markdown
### Endpoint: [METHOD /path]

**Happy Path:**
- Request: [Summary of request]
- Response: [Status code] - [Summary]
- Status: [PASSED / FAILED]

**Error Handling:**
- [Error case 1]: [Status code] - [Result]
- [Error case 2]: [Status code] - [Result]

**Edge Cases:**
- [Edge case 1]: [Result]
- [Edge case 2]: [Result]

**Issues Found:**
- [Description if any]
```

---

### Phase 3: Contract Validation

**Validate for each endpoint:**

1. **Request Contract:**
   - Required vs optional fields
   - Data types match spec
   - Validation rules enforced

2. **Response Contract:**
   - Response structure matches spec
   - All expected fields present
   - Correct data types returned

3. **HTTP Standards:**
   - Correct status codes used
   - Appropriate error messages
   - Headers properly set (Content-Type, CORS, etc.)

**Contract Checklist:**

```markdown
### Contract Validation: [Endpoint]

**Request:**
- [ ] Required fields enforced
- [ ] Optional fields accepted
- [ ] Invalid types rejected
- [ ] Validation errors clear

**Response:**
- [ ] Schema matches spec
- [ ] All fields present
- [ ] Types correct
- [ ] Pagination works (if applicable)

**Status Codes:**
- [ ] 200 for successful GET
- [ ] 201 for successful POST
- [ ] 400 for validation errors
- [ ] 401 for unauthorized
- [ ] 404 for not found
- [ ] 500 handled gracefully
```

---

### Phase 4: Security Checks

**Basic security validations:**

1. **Authentication:**
   - Endpoints require auth when expected
   - Invalid tokens rejected
   - Token expiration handled

2. **Authorization:**
   - Users can only access their data
   - Role restrictions enforced
   - Resource ownership validated

3. **Input Validation:**
   - SQL injection attempts rejected
   - XSS payloads sanitized
   - Path traversal prevented

**Security Checklist:**

```markdown
### Security Validation

**Authentication:**
- [ ] Missing token returns 401
- [ ] Invalid token returns 401
- [ ] Expired token returns 401

**Authorization:**
- [ ] Cannot access other users' data
- [ ] Role restrictions work
- [ ] Resource ownership checked

**Input Validation:**
- [ ] SQL injection: `' OR 1=1 --` → Rejected
- [ ] XSS: `<script>alert(1)</script>` → Sanitized
- [ ] Large payload: [Max size] → Handled
```

---

### Phase 5: Session Summary

**Generate comprehensive report:**

```markdown
# API Exploratory Testing Session Notes

**Date:** [Date]
**API Base URL:** [URL]
**Feature/Story:** [Scope]
**Duration:** [Time spent]

---

## Executive Summary

- **Overall Status:** [PASSED / ISSUES FOUND / BLOCKED]
- **Endpoints Tested:** [X of Y]
- **Issues Found:** [Number]

---

## Endpoints Tested

### 1. [METHOD /endpoint] - [PASSED/FAILED]

**Happy Path:** [Summary]
**Error Handling:** [Summary]
**Edge Cases:** [Summary]

### 2. [METHOD /endpoint] - [PASSED/FAILED]

[Details...]

---

## Issues Found

### Issue 1: [Title]

- **Endpoint:** [METHOD /path]
- **Severity:** [Critical/High/Medium/Low]
- **Description:** [What's wrong]
- **Request:**
  ```json
  { "example": "request" }
  ```
- **Expected Response:** [What should happen]
- **Actual Response:**
  ```json
  { "example": "response" }
  ```

---

## Contract Deviations

| Endpoint | Issue | Expected | Actual |
| -------- | ----- | -------- | ------ |
| [Path]   | [Desc]| [Spec]   | [Real] |

---

## Security Findings

- [Any security concerns discovered]

---

## Recommendations

### For Development:
- [Fix suggestions]

### For Automation:
- [Endpoints to prioritize for automated tests]
- [Test scenarios to automate]

---

## Next Steps

- [ ] Report bugs found (use bug-report.md)
- [ ] Update API documentation if needed
- [ ] Proceed to API automation (Stage 4)
```

---

## Decision Point

After exploration, decide:

| Result           | Action                                            |
| ---------------- | ------------------------------------------------- |
| **PASSED**       | Proceed to automation, document findings          |
| **ISSUES FOUND** | Report bugs, wait for fixes, re-test              |
| **BLOCKED**      | Critical API failures, escalate to development    |

---

## Best Practices

1. **Test the contract, not just success** - Verify error responses too
2. **Use realistic test data** - Avoid `test123` style data
3. **Check response times** - Note slow endpoints
4. **Validate pagination** - Test with many records
5. **Test concurrency** - Same request simultaneously
6. **Document everything** - Include request/response examples

---

## Integration with KATA

This API exploration feeds into:

1. **Bug Reports** - API issues → `bug-report.md`
2. **API Architecture** - Findings update `.context/api-architecture.md`
3. **API Automation** - Validated endpoints → Stage 4 automation

---

## Output

- API session notes with all findings
- List of issues ready for bug reporting
- Contract deviation report
- Recommendations for API automation
