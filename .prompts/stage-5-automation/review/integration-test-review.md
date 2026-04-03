# Integration Test Review

> **Phase**: 3 of 3 (Plan → Coding → Review)
> **Purpose**: Validate KATA compliance, code quality, and test quality of implemented API code.
> **Output**: Issue report with severity levels and improvement suggestions.

---

## Context Loading

**Load these files for reference:**

1. `.context/guidelines/TAE/kata-ai-index.md` → Core KATA patterns
2. `.context/guidelines/TAE/automation-standards.md` → Rules and anti-patterns
3. `.context/guidelines/TAE/test-design-principles.md` → ATCs vs helpers, assertions split

---

## Input Required

1. **Implemented code** from Phase 2:
   - API Component file (`{Resource}Api.ts`)
   - Test file (`{resource}.test.ts`)
   - Fixture updates (`ApiFixture.ts`)
   - Type definitions (`types.ts`)

2. **Original Plan** from Phase 1 (for reference)

---

## Review Process

### Step 1: Gather Code for Review

Collect all files to review:

```bash
# Read the component
cat tests/components/api/{Resource}Api.ts

# Read the test file
cat tests/integration/{resource}/{resource}.test.ts

# Read fixture changes
cat tests/components/ApiFixture.ts

# Check type definitions
cat tests/data/types.ts
```

---

### Step 2: KATA Compliance Review

#### 2.1 Component Structure

| Check | Criteria | Status |
|-------|----------|--------|
| K-01 | Extends `ApiBase` | [ ] PASS / [ ] FAIL |
| K-02 | Constructor accepts `TestContextOptions` | [ ] PASS / [ ] FAIL |
| K-03 | `@atc` decorator present with valid ID | [ ] PASS / [ ] FAIL |
| K-04 | ATCs are complete test cases (not single requests) | [ ] PASS / [ ] FAIL |
| K-05 | Fixed assertions inside ATCs | [ ] PASS / [ ] FAIL |
| K-06 | ATCs don't call other ATCs | [ ] PASS / [ ] FAIL |
| K-07 | Proper return type (tuple) | [ ] PASS / [ ] FAIL |

#### 2.2 ATC Quality

For each ATC, verify:

```markdown
### ATC: {methodName}

| Check | Criteria | Status |
|-------|----------|--------|
| A-01 | Decorator: `@atc('{TEST-ID}')` | [ ] |
| A-02 | Name follows convention | [ ] |
| A-03 | Parameters are typed | [ ] |
| A-04 | Return type is tuple | [ ] |
| A-05 | Uses correct HTTP method helper | [ ] |
| A-06 | Type generics specified | [ ] |
| A-07 | Contains status code assertion | [ ] |
| A-08 | Contains body validation assertion | [ ] |
```

#### 2.3 Return Type Validation

| HTTP Method | Expected Return Type | Component Returns |
|-------------|---------------------|-------------------|
| GET (single) | `[APIResponse, TBody]` | [ ] Correct |
| GET (list) | `[APIResponse, TBody[]]` or `[APIResponse, ListResponse]` | [ ] Correct |
| POST | `[APIResponse, TBody, TPayload]` | [ ] Correct |
| PUT/PATCH | `[APIResponse, TBody, TPayload]` | [ ] Correct |
| DELETE | `[APIResponse, void]` | [ ] Correct |

---

### Step 3: Type Safety Review

#### 3.1 Type Definitions

| Check | Criteria | Status |
|-------|----------|--------|
| TS-01 | Request payload types defined | [ ] PASS / [ ] FAIL |
| TS-02 | Response types defined | [ ] PASS / [ ] FAIL |
| TS-03 | Error response type defined | [ ] PASS / [ ] FAIL |
| TS-04 | No `any` types | [ ] PASS / [ ] FAIL |
| TS-05 | Types exported for test file use | [ ] PASS / [ ] FAIL |
| TS-06 | Generic types on API methods | [ ] PASS / [ ] FAIL |

#### 3.2 Type Usage

| Check | Criteria | Status |
|-------|----------|--------|
| TU-01 | `apiGET<TBody>()` has type parameter | [ ] PASS / [ ] FAIL |
| TU-02 | `apiPOST<TBody, TPayload>()` has both types | [ ] PASS / [ ] FAIL |
| TU-03 | Return types match declared types | [ ] PASS / [ ] FAIL |
| TU-04 | Payload parameters have explicit types | [ ] PASS / [ ] FAIL |

---

### Step 4: Code Quality Review

#### 4.1 Import Quality

| Check | Criteria | Status |
|-------|----------|--------|
| I-01 | Using import aliases (`@api/`, `@data/`, etc.) | [ ] PASS / [ ] FAIL |
| I-02 | No relative imports (`../../../`) | [ ] PASS / [ ] FAIL |
| I-03 | Type imports use `import type` | [ ] PASS / [ ] FAIL |
| I-04 | Imports organized (types → external → internal) | [ ] PASS / [ ] FAIL |
| I-05 | Types re-exported from component | [ ] PASS / [ ] FAIL |

#### 4.2 Method Quality

| Check | Criteria | Status |
|-------|----------|--------|
| M-01 | Max 2 positional parameters | [ ] PASS / [ ] FAIL |
| M-02 | Object params for complex inputs | [ ] PASS / [ ] FAIL |
| M-03 | JSDoc comments on public methods | [ ] PASS / [ ] FAIL |
| M-04 | Methods organized logically | [ ] PASS / [ ] FAIL |
| M-05 | Private helpers are private | [ ] PASS / [ ] FAIL |

#### 4.3 Assertion Quality

| Check | Criteria | Status |
|-------|----------|--------|
| AS-01 | Status code always asserted | [ ] PASS / [ ] FAIL |
| AS-02 | At least one body field asserted | [ ] PASS / [ ] FAIL |
| AS-03 | Using Playwright expect | [ ] PASS / [ ] FAIL |
| AS-04 | Assertions match expected behavior | [ ] PASS / [ ] FAIL |

---

### Step 5: Test File Review

#### 5.1 Test Structure

| Check | Criteria | Status |
|-------|----------|--------|
| TF-01 | Imports `test` from `@TestFixture` | [ ] PASS / [ ] FAIL |
| TF-02 | Uses `test.describe()` for grouping | [ ] PASS / [ ] FAIL |
| TF-03 | `beforeEach` for authentication | [ ] PASS / [ ] FAIL |
| TF-04 | ARRANGE-ACT-ASSERT structure | [ ] PASS / [ ] FAIL |
| TF-05 | Descriptive test names | [ ] PASS / [ ] FAIL |
| TF-06 | Appropriate tags (`@integration`, etc.) | [ ] PASS / [ ] FAIL |

#### 5.2 Test Independence

| Check | Criteria | Status |
|-------|----------|--------|
| TI-01 | Each test generates its own data | [ ] PASS / [ ] FAIL |
| TI-02 | No shared mutable state | [ ] PASS / [ ] FAIL |
| TI-03 | Tests can run in any order | [ ] PASS / [ ] FAIL |
| TI-04 | No `test.only` or `test.skip` without reason | [ ] PASS / [ ] FAIL |

#### 5.3 Test Data

| Check | Criteria | Status |
|-------|----------|--------|
| TD-01 | Using Faker for dynamic data | [ ] PASS / [ ] FAIL |
| TD-02 | No hardcoded UUIDs or IDs | [ ] PASS / [ ] FAIL |
| TD-03 | No real credentials | [ ] PASS / [ ] FAIL |
| TD-04 | Factory functions for test data | [ ] PASS / [ ] FAIL |

#### 5.4 Test Coverage

| Check | Criteria | Status |
|-------|----------|--------|
| TC-01 | Happy path tested | [ ] PASS / [ ] FAIL |
| TC-02 | Error cases tested (400, 404, etc.) | [ ] PASS / [ ] FAIL |
| TC-03 | Auth failure tested (401) | [ ] PASS / [ ] FAIL |
| TC-04 | Edge cases considered | [ ] PASS / [ ] FAIL |

---

### Step 6: Fixture Registration Review

| Check | Criteria | Status |
|-------|----------|--------|
| F-01 | Component imported in ApiFixture | [ ] PASS / [ ] FAIL |
| F-02 | Property declared as `public readonly` | [ ] PASS / [ ] FAIL |
| F-03 | Initialized in constructor | [ ] PASS / [ ] FAIL |
| F-04 | Property name follows camelCase | [ ] PASS / [ ] FAIL |

---

## Issue Report Template

Generate a report with all findings:

```markdown
# Code Review Report: {TEST-ID}

## Summary

| Category | Pass | Fail | Total |
|----------|------|------|-------|
| KATA Compliance | X | Y | 7 |
| Type Safety | X | Y | 6 |
| Code Quality | X | Y | 9 |
| Test Quality | X | Y | 14 |
| **Total** | X | Y | 36 |

## Verdict

- [ ] **APPROVED** - No critical/high issues, ready for merge
- [ ] **NEEDS REVISION** - Has critical/high issues that must be fixed
- [ ] **MINOR CHANGES** - Has medium/low issues, can merge after fixing

---

## Issues Found

### CRITICAL Issues (Must Fix)

| ID | Location | Issue | Suggestion |
|----|----------|-------|------------|
| C-01 | {file}:{line} | {description} | {how to fix} |

### HIGH Issues (Should Fix)

| ID | Location | Issue | Suggestion |
|----|----------|-------|------------|
| H-01 | {file}:{line} | {description} | {how to fix} |

### MEDIUM Issues (Recommended)

| ID | Location | Issue | Suggestion |
|----|----------|-------|------------|
| M-01 | {file}:{line} | {description} | {how to fix} |

### LOW Issues (Nice to Have)

| ID | Location | Issue | Suggestion |
|----|----------|-------|------------|
| L-01 | {file}:{line} | {description} | {how to fix} |

---

## Code Snippets with Issues

### Issue C-01: {Title}

**Location**: `{file}:{line}`

**Current Code**:
```typescript
// Current problematic code
```

**Suggested Fix**:
```typescript
// Fixed code
```

**Reason**: {explanation}

---

## Passed Checks

All the following checks passed:
- [x] K-01: Extends ApiBase correctly
- [x] K-02: Constructor pattern correct
- [x] ... (list all passed checks)

---

## Recommendations

1. **{Category}**: {Recommendation}
2. **{Category}**: {Recommendation}
```

---

## Severity Definitions

| Severity | Definition | Action |
|----------|------------|--------|
| **CRITICAL** | Breaks KATA architecture, test won't work, security issue | Must fix before merge |
| **HIGH** | Violates important standards, potential bugs | Should fix before merge |
| **MEDIUM** | Best practice violation, code smell | Recommended to fix |
| **LOW** | Style issue, minor improvement | Nice to have |

### Critical Issues Examples (API-specific)

- Missing `@atc` decorator
- No assertions in ATC
- Wrong return type (not tuple)
- Using `any` for response type
- Missing authentication handling
- Hardcoded credentials in code

### High Issues Examples

- Missing type generics on API methods
- Missing status code assertion
- Relative imports instead of aliases
- ATC calls another ATC
- No error case tests

### Medium Issues Examples

- Missing JSDoc comments
- Types defined in component instead of types.ts
- Inconsistent naming convention
- Missing pagination tests

### Low Issues Examples

- Import order not optimal
- Variable naming could be clearer
- Extra blank lines

---

## Common Issues Reference

### Issue: Missing Type Generics

**Pattern**: API method called without type parameters

```typescript
// ❌ WRONG
const [response, body] = await this.apiGET(endpoint);
```

**Fix**: Add type parameters

```typescript
// ✅ CORRECT
const [response, body] = await this.apiGET<ResourceResponse>(endpoint);
```

---

### Issue: Wrong Return Type

**Pattern**: Not returning tuple or missing payload

```typescript
// ❌ WRONG - Not a tuple
@atc('TEST-001')
async createResource(payload) {
  const response = await this.apiPOST(endpoint, payload);
  return response;
}

// ❌ WRONG - Missing payload in return
@atc('TEST-001')
async createResource(payload): Promise<[APIResponse, Resource]> {
  const [response, body] = await this.apiPOST(endpoint, payload);
  return [response, body]; // Missing payload!
}
```

**Fix**: Return proper tuple with payload

```typescript
// ✅ CORRECT
@atc('TEST-001')
async createResourceSuccessfully(
  payload: CreatePayload
): Promise<[APIResponse, Resource, CreatePayload]> {
  const [response, body] = await this.apiPOST<Resource, CreatePayload>(
    endpoint,
    payload
  );
  expect(response.status()).toBe(201);
  return [response, body, payload];
}
```

---

### Issue: Missing Status Code Assertion

**Pattern**: No assertion on response status

```typescript
// ❌ WRONG - No status check
@atc('TEST-001')
async getResourceSuccessfully(id: string) {
  const [response, body] = await this.apiGET<Resource>(endpoint);
  expect(body.id).toBeDefined(); // Only checks body
  return [response, body];
}
```

**Fix**: Always assert status code

```typescript
// ✅ CORRECT
@atc('TEST-001')
async getResourceSuccessfully(id: string) {
  const [response, body] = await this.apiGET<Resource>(endpoint);
  expect(response.status()).toBe(200); // Status assertion
  expect(body.id).toBeDefined();
  return [response, body];
}
```

---

### Issue: Hardcoded Test Data

**Pattern**: Static values in tests

```typescript
// ❌ WRONG
const payload = {
  email: 'test@example.com',
  userId: '550e8400-e29b-41d4-a716-446655440000',
};
```

**Fix**: Use Faker for dynamic data

```typescript
// ✅ CORRECT
const payload = {
  email: faker.internet.email(),
  userId: faker.string.uuid(),
};
```

---

### Issue: ATC Calling ATC

**Pattern**: One ATC invokes another

```typescript
// ❌ WRONG
@atc('TEST-001')
async createAndVerifyResource(payload) {
  const [, created] = await this.createResourceSuccessfully(payload); // ATC!
  const [, fetched] = await this.getResourceSuccessfully(created.id); // ATC!
  return fetched;
}
```

**Fix**: Keep ATCs atomic, orchestrate in tests

```typescript
// ✅ CORRECT - In test file
test('create and verify', async ({ api }) => {
  const [, created] = await api.resource.createResourceSuccessfully(payload);
  const [, fetched] = await api.resource.getResourceSuccessfully(created.id);
  expect(fetched.id).toBe(created.id);
});
```

---

### Issue: Missing Error Handling Tests

**Pattern**: Only testing happy path

```typescript
// ❌ INCOMPLETE - Only happy path
test.describe('Resource API', () => {
  test('should create resource', async ({ api }) => {
    // Only success case
  });
});
```

**Fix**: Add error case tests

```typescript
// ✅ COMPLETE
test.describe('Resource API', () => {
  test('should create resource', async ({ api }) => { ... });
  test('should return 400 for invalid payload', async ({ api }) => { ... });
  test('should return 404 for non-existent', async ({ api }) => { ... });
  test('should return 401 without auth', async ({ api }) => { ... });
});
```

---

### Issue: Missing Authentication in beforeEach

**Pattern**: Tests assume auth but don't set it up

```typescript
// ❌ WRONG - No auth setup
test.describe('Resource API', () => {
  test('should get resource', async ({ api }) => {
    // Will fail if endpoint requires auth
    await api.resource.getSuccessfully(id);
  });
});
```

**Fix**: Add beforeEach authentication

```typescript
// ✅ CORRECT
test.describe('Resource API', () => {
  test.beforeEach(async ({ api }) => {
    await api.auth.authenticateSuccessfully({
      email: process.env.TEST_USER_EMAIL!,
      password: process.env.TEST_USER_PASSWORD!,
    });
  });

  test('should get resource', async ({ api }) => {
    await api.resource.getSuccessfully(id);
  });
});
```

---

## Final Checklist

Before approving:

- [ ] All CRITICAL issues resolved
- [ ] All HIGH issues resolved (or documented exception)
- [ ] Test runs successfully: `bun run test <test-file>`
- [ ] No TypeScript errors: `bun run type-check`
- [ ] Linting passes: `bun run lint`
- [ ] Component properly registered in fixture
- [ ] Test has appropriate tags for CI
- [ ] Both success and error cases tested

---

## After Review

Once review is complete:

1. **If APPROVED**:
   - Update TMS test status to "Automated"
   - Commit and push changes
   - Create PR if required

2. **If NEEDS REVISION**:
   - Return to Coding phase
   - Fix identified issues
   - Run review again

---

**Review Complete** - Document the verdict and share with the team.
