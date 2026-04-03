# E2E Test Review

> **Phase**: 3 of 3 (Plan → Coding → Review)
> **Purpose**: Validate KATA compliance, code quality, and test quality of implemented code.
> **Output**: Issue report with severity levels and improvement suggestions.

---

## Context Loading

**Load these files for reference:**

1. `.context/guidelines/TAE/kata-ai-index.md` → Core KATA patterns
2. `.context/guidelines/TAE/automation-standards.md` → Rules and anti-patterns
3. `.context/guidelines/TAE/test-design-principles.md` → ATCs vs helpers, flow-based tests

---

## Input Required

1. **Implemented code** from Phase 2:
   - UI Component file (`{PageName}Page.ts`)
   - Test file (`{feature}.test.ts`)
   - Fixture updates (`UiFixture.ts`)
   - Type definitions (if any)

2. **Original Plan** from Phase 1 (for reference)

---

## Review Process

### Step 1: Gather Code for Review

Collect all files to review:

```bash
# Read the component
cat tests/components/ui/{PageName}Page.ts

# Read the test file
cat tests/e2e/{feature}/{feature}.test.ts

# Read fixture changes
cat tests/components/UiFixture.ts

# Check for type definitions
cat tests/data/types.ts
```

---

### Step 2: KATA Compliance Review

#### 2.1 Component Structure

| Check | Criteria | Status |
|-------|----------|--------|
| K-01 | Extends `UiBase` | [ ] PASS / [ ] FAIL |
| K-02 | Constructor accepts `TestContextOptions` | [ ] PASS / [ ] FAIL |
| K-03 | `@atc` decorator present with valid ID | [ ] PASS / [ ] FAIL |
| K-04 | ATCs are complete test cases (not single clicks) | [ ] PASS / [ ] FAIL |
| K-05 | Fixed assertions inside ATCs | [ ] PASS / [ ] FAIL |
| K-06 | Locators inline (not in separate file) | [ ] PASS / [ ] FAIL |
| K-07 | Shared locators only if used in 2+ ATCs | [ ] PASS / [ ] FAIL |
| K-08 | ATCs don't call other ATCs | [ ] PASS / [ ] FAIL |
| K-09 | `goto()` method separate from ATCs | [ ] PASS / [ ] FAIL |

#### 2.2 ATC Quality

For each ATC, verify:

```markdown
### ATC: {methodName}

| Check | Criteria | Status |
|-------|----------|--------|
| A-01 | Decorator: `@atc('{TEST-ID}')` | [ ] |
| A-02 | Name follows convention: `{verb}{Resource}Successfully` or `{verb}With{Condition}` | [ ] |
| A-03 | Parameters are typed | [ ] |
| A-04 | Return type is `Promise<void>` | [ ] |
| A-05 | Contains at least one assertion | [ ] |
| A-06 | Assertions use Playwright expect | [ ] |
| A-07 | No hardcoded test data | [ ] |
| A-08 | No `waitForTimeout()` calls | [ ] |
```

---

### Step 3: Code Quality Review

#### 3.1 TypeScript Quality

| Check | Criteria | Status |
|-------|----------|--------|
| T-01 | No `any` types | [ ] PASS / [ ] FAIL |
| T-02 | All function parameters typed | [ ] PASS / [ ] FAIL |
| T-03 | Return types specified | [ ] PASS / [ ] FAIL |
| T-04 | Interfaces/types exported for reuse | [ ] PASS / [ ] FAIL |
| T-05 | Types defined after imports, before class | [ ] PASS / [ ] FAIL |

#### 3.2 Import Quality

| Check | Criteria | Status |
|-------|----------|--------|
| I-01 | Using import aliases (`@ui/`, `@utils/`, etc.) | [ ] PASS / [ ] FAIL |
| I-02 | No relative imports (`../../../`) | [ ] PASS / [ ] FAIL |
| I-03 | Type imports use `import type` | [ ] PASS / [ ] FAIL |
| I-04 | Imports organized (types → external → internal) | [ ] PASS / [ ] FAIL |

#### 3.3 Method Quality

| Check | Criteria | Status |
|-------|----------|--------|
| M-01 | Max 2 positional parameters (use object if more) | [ ] PASS / [ ] FAIL |
| M-02 | Methods organized: constructor → navigation → ATCs → helpers | [ ] PASS / [ ] FAIL |
| M-03 | Private helpers are truly private (not public) | [ ] PASS / [ ] FAIL |
| M-04 | JSDoc comments on public methods | [ ] PASS / [ ] FAIL |

---

### Step 4: Test File Review

#### 4.1 Test Structure

| Check | Criteria | Status |
|-------|----------|--------|
| TF-01 | Imports `test` from `@TestFixture` | [ ] PASS / [ ] FAIL |
| TF-02 | Uses `test.describe()` for grouping | [ ] PASS / [ ] FAIL |
| TF-03 | ARRANGE-ACT-ASSERT structure | [ ] PASS / [ ] FAIL |
| TF-04 | Descriptive test names | [ ] PASS / [ ] FAIL |
| TF-05 | Appropriate tags (`@regression`, `@smoke`, etc.) | [ ] PASS / [ ] FAIL |

#### 4.2 Test Independence

| Check | Criteria | Status |
|-------|----------|--------|
| TI-01 | Each test generates its own data | [ ] PASS / [ ] FAIL |
| TI-02 | No shared mutable state between tests | [ ] PASS / [ ] FAIL |
| TI-03 | Tests can run in any order | [ ] PASS / [ ] FAIL |
| TI-04 | No `test.only` or `test.skip` without reason | [ ] PASS / [ ] FAIL |

#### 4.3 Test Data

| Check | Criteria | Status |
|-------|----------|--------|
| TD-01 | Using Faker or factory functions | [ ] PASS / [ ] FAIL |
| TD-02 | No hardcoded UUIDs or IDs | [ ] PASS / [ ] FAIL |
| TD-03 | No real user credentials | [ ] PASS / [ ] FAIL |
| TD-04 | Unique data per test run (timestamps, etc.) | [ ] PASS / [ ] FAIL |

---

### Step 5: Fixture Registration Review

| Check | Criteria | Status |
|-------|----------|--------|
| F-01 | Component imported in UiFixture | [ ] PASS / [ ] FAIL |
| F-02 | Property declared as `public readonly` | [ ] PASS / [ ] FAIL |
| F-03 | Initialized in constructor with same options | [ ] PASS / [ ] FAIL |
| F-04 | Property name follows camelCase | [ ] PASS / [ ] FAIL |

---

### Step 6: Locator Strategy Review

| Check | Criteria | Status |
|-------|----------|--------|
| L-01 | Prefers `data-testid` attributes | [ ] PASS / [ ] FAIL |
| L-02 | Uses `role` for semantic elements | [ ] PASS / [ ] FAIL |
| L-03 | Avoids brittle selectors (nth-child, classes) | [ ] PASS / [ ] FAIL |
| L-04 | Locators are specific (not too broad) | [ ] PASS / [ ] FAIL |

---

## Issue Report Template

Generate a report with all findings:

```markdown
# Code Review Report: {TEST-ID}

## Summary

| Category | Pass | Fail | Total |
|----------|------|------|-------|
| KATA Compliance | X | Y | 9 |
| Code Quality | X | Y | 12 |
| Test Quality | X | Y | 8 |
| **Total** | X | Y | 29 |

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

**Reason**: {explanation of why this is an issue}

---

## Passed Checks

All the following checks passed:
- [x] K-01: Extends UiBase correctly
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
| **CRITICAL** | Breaks KATA architecture, test won't work correctly, security issue | Must fix before merge |
| **HIGH** | Violates important standards, potential maintenance issues | Should fix before merge |
| **MEDIUM** | Best practice violation, code smell | Recommended to fix |
| **LOW** | Style issue, minor improvement | Nice to have |

### Critical Issues Examples

- ATC calls another ATC
- Missing `@atc` decorator
- No assertions in ATC
- Using `waitForTimeout()`
- Hardcoded credentials

### High Issues Examples

- Relative imports instead of aliases
- Missing TypeScript types
- Locators in separate file
- Single-interaction ATC

### Medium Issues Examples

- Missing JSDoc comments
- Suboptimal locator strategy
- Test data could be more unique
- Missing tags on tests

### Low Issues Examples

- Import order not optimal
- Variable naming could be clearer
- Extra blank lines

---

## Common Issues Reference

### Issue: ATC is Too Simple

**Pattern**: ATC only does one action without assertions

```typescript
// ❌ WRONG
@atc('TEST-001')
async clickSubmit() {
  await this.page.click('#submit');
}
```

**Fix**: Make it a complete test case with assertions

```typescript
// ✅ CORRECT
@atc('TEST-001')
async submitFormSuccessfully(data: FormData) {
  await this.page.fill('#email', data.email);
  await this.page.click('#submit');
  await expect(this.page).toHaveURL(/.*success.*/);
}
```

---

### Issue: Using waitForTimeout

**Pattern**: Arbitrary waits instead of conditions

```typescript
// ❌ WRONG
await this.page.waitForTimeout(3000);
```

**Fix**: Use condition-based waits

```typescript
// ✅ CORRECT
await this.page.waitForSelector('[data-loaded="true"]');
// or
await this.page.waitForLoadState('networkidle');
// or
await expect(element).toBeVisible();
```

---

### Issue: ATC Calling ATC

**Pattern**: One ATC invokes another

```typescript
// ❌ WRONG
@atc('TEST-001')
async checkoutFlow() {
  await this.loginSuccessfully(creds); // This is another ATC!
}
```

**Fix**: Use Flows module or test file orchestration

```typescript
// ✅ CORRECT - In test file
await ui.login.loginSuccessfully(creds);
await ui.checkout.completeCheckoutSuccessfully();

// Or use Flows module for reusable setup
```

---

### Issue: Locators in Separate File

**Pattern**: Centralized locator constants

```typescript
// ❌ WRONG
// locators/login.ts
export const LOCATORS = { email: '#email' };

// LoginPage.ts
import { LOCATORS } from './locators';
await this.page.fill(LOCATORS.email, data.email);
```

**Fix**: Inline locators in ATCs

```typescript
// ✅ CORRECT
await this.page.locator('[data-testid="email-input"]').fill(data.email);
```

---

### Issue: Missing Type Safety

**Pattern**: Using `any` or missing types

```typescript
// ❌ WRONG
async login(data: any) {
  // ...
}
```

**Fix**: Define proper types

```typescript
// ✅ CORRECT
interface LoginCredentials {
  email: string;
  password: string;
}

async loginSuccessfully(data: LoginCredentials): Promise<void> {
  // ...
}
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
