# E2E Test Automation Plan

> **Phase**: 1 of 3 (Plan → Coding → Review)
> **Purpose**: Analyze a documented test case and create an implementation plan following KATA architecture.
> **Output**: Detailed plan ready for the Coding phase.

---

## Context Loading

**Load these files before proceeding:**

1. `.context/guidelines/TAE/kata-ai-index.md` → Core KATA patterns
2. `.context/guidelines/TAE/kata-architecture.md` → Layer structure
3. `.context/guidelines/TAE/e2e-testing-patterns.md` → E2E specific patterns
4. `.context/guidelines/TAE/automation-standards.md` → Rules and naming conventions
5. `.context/playwright-automation-system.md` → Code architecture overview
6. `.context/test-management-system.md` → TMS configuration (for test ID format)

---

## Input Required

Provide the documented test case from Stage 3 with:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ REQUIRED INPUT FROM STAGE 3                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Test Case ID: {TEST-XXX}                                                 │
│ 2. Test Case Name: {Validate <CORE> <CONDITIONAL>}                          │
│ 3. Gherkin Scenario (Given/When/Then with Scenario Outline)                 │
│ 4. Variables Table (with how to obtain each variable)                       │
│ 5. Implementation Code (source files being tested)                          │
│ 6. Available Test IDs (data-testid attributes)                              │
│ 7. Architecture (SSR / Client-side / Hybrid)                                │
│ 8. Priority/ROI Score (optional)                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Planning Workflow

### Step 1: Test Case Analysis

Extract and document:

```markdown
## Test Case Analysis

### Basic Information
- **Test ID**: {TEST-XXX}
- **Name**: {test case name}
- **Type**: E2E (UI + optional API verification)
- **Priority**: {Critical/High/Medium/Low}

### Gherkin Breakdown

| Step | Type | Action | Expected |
|------|------|--------|----------|
| Given | Precondition | {what must exist} | {state} |
| When | Action | {user action} | {triggers} |
| Then | Assertion | {verification} | {expected result} |

### Variables Identified

| Variable | Type | How to Obtain | Faker Pattern |
|----------|------|---------------|---------------|
| {email} | string | Generate | faker.internet.email() |
| {user_id} | UUID | API setup / DB | api.users.createSuccessfully() |
| {amount} | number | Test data | faker.number.float({min: 1, max: 1000}) |

### UI Elements Needed

| Element | Locator Strategy | data-testid | Fallback |
|---------|------------------|-------------|----------|
| Email input | data-testid | email-input | input[name="email"] |
| Submit button | data-testid | submit-btn | button[type="submit"] |
| Error message | role | - | role="alert" |
```

---

### Step 2: Existing Components Check

Search the codebase for existing components:

```bash
# Check existing UI components
ls tests/components/ui/

# Check existing fixtures
cat tests/components/UiFixture.ts

# Search for similar ATCs
grep -r "@atc" tests/components/ui/
```

Document findings:

```markdown
## Existing Components Analysis

### Relevant UI Components Found
| Component | File | ATCs Available | Can Reuse? |
|-----------|------|----------------|------------|
| LoginPage | tests/components/ui/LoginPage.ts | loginSuccessfully, loginWithInvalidCredentials | Yes/Partial/No |

### Relevant API Components Found (for setup)
| Component | File | ATCs Available | Use For |
|-----------|------|----------------|---------|
| AuthApi | tests/components/api/AuthApi.ts | authenticateSuccessfully | Auth setup |

### Decision
- [ ] Create NEW component: {PageName}Page.ts
- [ ] Extend EXISTING component: {existing}.ts
- [ ] Use ONLY existing components (no new code needed)
```

---

### Step 3: Architecture Decision

Determine the KATA architecture:

```markdown
## Architecture Decision

### Component Location
- **Layer**: 3 (Domain Component)
- **Type**: UI Component
- **File**: `tests/components/ui/{PageName}Page.ts`
- **Extends**: `UiBase`

### Fixture to Use
| Option | When to Use | Selected |
|--------|-------------|----------|
| `{ ui }` | UI-only testing | [ ] |
| `{ test }` | API setup + UI verification | [ ] |

### Preconditions Strategy
| Precondition | Strategy | Implementation |
|--------------|----------|----------------|
| User authenticated | API setup | `api.auth.authenticateSuccessfully()` |
| Data exists | API create | `api.resource.createSuccessfully()` |
| Navigation | UI action | `page.goto(url)` |

### Flow Module Needed?
- [ ] No - Simple test, no reusable setup
- [ ] Yes - Create `{Domain}Flows.ts` for reusable setup
```

---

### Step 4: ATC Design

Design the ATCs to implement:

```markdown
## ATC Design

### Primary ATC

| Attribute | Value |
|-----------|-------|
| **Name** | `{verb}{Resource}Successfully` or `{verb}With{Condition}` |
| **Test ID** | `{TEST-XXX}` |
| **Parameters** | `(data: {TypeName}): Promise<void>` |
| **Returns** | `Promise<void>` |

**Method Signature:**
```typescript
@atc('{TEST-XXX}')
async {methodName}(data: {TypeName}): Promise<void>
```

**Fixed Assertions (inside ATC):**
1. `await expect(this.page).toHaveURL(/.*{expected-pattern}.*/)`
2. `await expect(this.page.locator('[data-testid="..."]')).toBeVisible()`
3. `await expect(this.page.locator('[data-testid="..."]')).toHaveText('{expected}')`

### Locators to Use

| Element | Locator | Shared? |
|---------|---------|---------|
| Email field | `this.page.locator('[data-testid="email-input"]')` | No (inline) |
| Submit button | `this.submitButton()` | Yes (used in 2+ ATCs) |

### Shared Locators (if any)
```typescript
// Extract to constructor property if used in 2+ ATCs
private readonly submitButton = () => this.page.locator('[data-testid="submit-btn"]');
```
```

---

### Step 5: Test File Design

Design the test file structure:

```markdown
## Test File Design

### File Location
`tests/e2e/{feature}/{feature}.test.ts`

### Test Structure
```typescript
import { test, expect } from '@TestFixture';
import type { {TypeName} } from '@ui/{PageName}Page';

test.describe('{Feature Name}', () => {
  test('{test description} @{tag1} @{tag2}', async ({ ui }) => {
    // ARRANGE
    const data: {TypeName} = {
      // Test data via Faker or fixtures
    };

    // ACT
    await ui.{component}.{atcMethod}(data);

    // ASSERT (optional - test-level assertions beyond ATC)
    // await expect(...).toBe(...);
  });
});
```

### Tags to Apply
- [ ] `@regression` - Include in regression suite
- [ ] `@smoke` - Include in smoke tests
- [ ] `@critical` - High priority test
- [ ] `@{feature}` - Feature-specific tag
```

---

### Step 6: Fixture Registration

Plan component registration:

```markdown
## Fixture Registration

### New Component Registration
If creating a new component, add to `UiFixture.ts`:

```typescript
// Import
import { {PageName}Page } from '@ui/{PageName}Page';

// In constructor
this.{pageName} = new {PageName}Page(options);

// Add property
public readonly {pageName}: {PageName}Page;
```

### Type Export
Export types from component for use in tests:

```typescript
// In {PageName}Page.ts
export interface {TypeName} {
  // ...fields
}

// Or re-export from types file
export type { {TypeName} } from '@data/types';
```
```

---

## Plan Output Template

Generate a final plan document:

```markdown
# Implementation Plan: {TEST-XXX}

## Summary
| Attribute | Value |
|-----------|-------|
| Test Case ID | {TEST-XXX} |
| Test Name | {name} |
| Component | {PageName}Page.ts |
| Action | CREATE / EXTEND / REUSE |
| ATC Name | {methodName} |
| Test File | tests/e2e/{feature}/{feature}.test.ts |
| Fixture | { ui } / { test } |

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `tests/components/ui/{PageName}Page.ts` | CREATE | New UI component |
| `tests/components/UiFixture.ts` | MODIFY | Register component |
| `tests/e2e/{feature}/{feature}.test.ts` | CREATE | Test file |
| `tests/data/types.ts` | MODIFY | Add type definitions |

## ATC Implementation Plan

### {methodName}
- **Decorator**: `@atc('{TEST-XXX}')`
- **Parameters**: `data: {TypeName}`
- **Steps**:
  1. Navigate to {url}
  2. Fill {field} with `data.{property}`
  3. Click {button}
  4. Assert {expected result}
- **Assertions**:
  - `expect(page).toHaveURL(...)`
  - `expect(element).toBeVisible()`

## Test Data Strategy

| Variable | Source | Pattern |
|----------|--------|---------|
| {var1} | Faker | `faker.{method}()` |
| {var2} | API Setup | `api.{component}.{method}()` |

## Preconditions

| Precondition | Method |
|--------------|--------|
| User logged in | `ui.login.loginSuccessfully(credentials)` OR storageState |
| Data exists | `api.{resource}.createSuccessfully(data)` |

## Dependencies

- [ ] Existing component: {name}
- [ ] API component for setup: {name}
- [ ] Flow module: {name} (if applicable)

---

**Ready for Phase 2: Coding**
```

---

## Validation Checklist

Before proceeding to Coding phase, verify:

- [ ] Test case fully analyzed (Gherkin breakdown complete)
- [ ] Variables mapped to Faker patterns or setup methods
- [ ] Existing components checked (no duplicate work)
- [ ] Architecture decision made (component, fixture, layer)
- [ ] ATC designed with proper naming convention
- [ ] Assertions defined (what the ATC validates)
- [ ] Locator strategy determined (data-testid preferred)
- [ ] Test file location determined
- [ ] Fixture registration planned
- [ ] Preconditions strategy defined (API setup vs UI flow)

---

## Common Patterns

### Naming Conventions

| Scenario | ATC Name Pattern | Example |
|----------|------------------|---------|
| Success case | `{verb}{Resource}Successfully` | `loginSuccessfully()` |
| Invalid input | `{verb}With{Invalid}{X}` | `loginWithInvalidCredentials()` |
| Empty state | `view{Resource}EmptyState` | `viewBookingsEmptyState()` |
| Not found | `{verb}WithNonExistent{X}` | `getBookingWithNonExistentId()` |

### Locator Priority

1. `data-testid` (preferred)
2. `role` + accessible name
3. `aria-label`
4. CSS selector (last resort)

### Assertion Types

| What to Assert | Playwright Method |
|----------------|-------------------|
| URL changed | `expect(page).toHaveURL(/pattern/)` |
| Element visible | `expect(locator).toBeVisible()` |
| Text content | `expect(locator).toHaveText('...')` |
| Element count | `expect(locator).toHaveCount(n)` |
| Input value | `expect(locator).toHaveValue('...')` |

---

## Next Step

Once the plan is complete and validated:

→ **Proceed to**: `e2e-test-automation-coding.md` (Phase 2)
