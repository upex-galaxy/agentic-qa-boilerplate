# ATC Spec: UPEX-105 — Login Successfully via UI

> **Ticket**: [UPEX-105](https://upex.atlassian.net/browse/UPEX-105)
> **Component**: `LoginPage` (`tests/components/ui/LoginPage.ts`)
> **Type**: UI — Happy path
> **Parent Story**: UPEX-100 (Validate User Session Management)

---

## 1. Test Case Summary

| Field | Value |
|-------|-------|
| **Name** | Login with valid credentials via UI |
| **Objective** | Validates that filling the login form and submitting redirects the user away from the login page |
| **Precondition** | Valid test user exists; browser navigated to `/login` via `goto()` |
| **Acceptance Criteria** | Form submission with valid credentials redirects away from `/login` |

---

## 2. ATC Contract

```typescript
/**
 * ATC: Login with valid credentials - expects success
 *
 * IMPORTANT: Call goto() before this ATC.
 * Fills credentials, submits, and verifies redirect away from login page.
 *
 * Fixed assertions:
 * - Page URL no longer contains /login (redirect happened)
 */
@atc('PROJ-101')
async loginSuccessfully(credentials: LoginCredentials): Promise<void>
```

### Method Signature

| Aspect | Value |
|--------|-------|
| **Name** | `loginSuccessfully` |
| **Parameters** | `credentials: LoginCredentials` (email + password) |
| **Return Type** | `Promise<void>` (UI ATCs always return void) |

---

## 3B. UI Details

### Page Navigation

| Aspect | Value |
|--------|-------|
| **Page Path** | `/login` |
| **Requires Auth** | No (login page is public) |
| **Navigation Method** | `await this.goto()` (call before ATC) |

### Return Type

```typescript
Promise<void>
```

### Locator Strategy

```typescript
// Inline locators — used via private helper fillAndSubmitLoginForm()
this.page.locator('[data-testid="login-email-input"]')
this.page.locator('[data-testid="login-password-input"]')
this.page.locator('[data-testid="login-submit-button"]')
```

| Locator | Strategy | Selector | Used In |
|---------|----------|----------|---------|
| Email input | `data-testid` | `login-email-input` | Shared (helper) |
| Password input | `data-testid` | `login-password-input` | Shared (helper) |
| Submit button | `data-testid` | `login-submit-button` | Shared (helper) |

### Playwright Assertions

```typescript
// Wait for redirect away from login page
await this.page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 });
await expect(this.page).not.toHaveURL(/.*\/login.*/);
```

---

## 4. Assertions Split

### Fixed Assertions (Inside ATC)

| # | Assertion | Code |
|---|-----------|------|
| 1 | Wait for URL redirect | `await this.page.waitForURL(url => !url.pathname.includes('/login'))` |
| 2 | Confirm not on login page | `await expect(this.page).not.toHaveURL(/.*\/login.*/)` |

### Test-Level Assertions (In Test File)

| # | Assertion | Why It's Test-Level |
|---|-----------|---------------------|
| 1 | Destination URL matches expected page | Depends on app routing (dashboard, home, etc.) |
| 2 | Dashboard content is visible | Specific to post-login UI state |
| 3 | User name displayed in header | Depends on test user data |

---

## 5. Code Template

```typescript
// In: tests/components/ui/LoginPage.ts

// ============================================
// Helpers (Private)
// ============================================

/**
 * Fill login form and submit
 * Helper that combines fill + submit actions
 */
private async fillAndSubmitLoginForm(credentials: LoginCredentials): Promise<void> {
  await this.page.locator('[data-testid="login-email-input"]').fill(credentials.email);
  await this.page.locator('[data-testid="login-password-input"]').fill(credentials.password);
  await this.page.locator('[data-testid="login-submit-button"]').click();
}

// ============================================
// ATCs - Complete Test Cases
// ============================================

/**
 * ATC: Login with valid credentials - expects success
 *
 * IMPORTANT: Call goto() before this ATC.
 * Fills credentials, submits, and verifies redirect away from login page.
 */
@atc('PROJ-101')
async loginSuccessfully(credentials: LoginCredentials): Promise<void> {
  await this.fillAndSubmitLoginForm(credentials);

  // Wait for authentication to complete and redirect
  await this.page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 });
  await expect(this.page).not.toHaveURL(/.*\/login.*/);
}
```

**Usage in test file:**

```typescript
// In: tests/e2e/auth/login.test.ts

test('should login and see dashboard', async ({ ui }) => {
  await ui.login.goto();
  await ui.login.loginSuccessfully({
    email: config.testUser.email,
    password: config.testUser.password,
  });

  // Test-level assertions
  await expect(ui.login.page).toHaveURL(/.*dashboard.*/);
  await expect(ui.login.page).toHaveTitle(/Dashboard/);
});
```

---

## 6. Equivalence Partitioning Check

| Input Variation | Expected Output | Same ATC? |
|-----------------|-----------------|-----------|
| Valid email + valid password | Redirect away from /login | Yes — Base case |
| Different valid user | Redirect away from /login | Yes — same output, parameterize |
| Invalid email | Error visible, stays on /login | No — `loginWithInvalidCredentials` (UPEX-106) |
| Valid email + wrong password | Error visible, stays on /login | No — `loginWithInvalidCredentials` (UPEX-106) |

**Decision**: One ATC for all valid login combinations (same output: redirect). A separate ATC (`loginWithInvalidCredentials`) for invalid combinations (same output: error + stays on page).

---

## 7. Dependencies

### Precondition Steps

| Step | How | Component |
|------|-----|-----------|
| Navigate to login page | `await ui.login.goto()` | `LoginPage` |

### Required Components

| Component | Exists? | Action Needed |
|-----------|---------|---------------|
| `LoginPage` | Yes | Method already exists |
| `UiFixture` | Yes | Already registered |

---

## 8. Checklist

- [x] Method name follows `{verb}{Resource}{Scenario}` convention
- [x] Parameters: 1 positional (under max 2 limit)
- [x] Return type is `Promise<void>` (UI ATC)
- [x] Fixed assertions validate success invariants (URL redirect)
- [x] Test-level assertions documented for test file
- [x] Not duplicating an existing ATC (equivalence partitioning checked)
- [x] Locators use `data-testid` (best practice)
- [x] Component placement determined (existing `LoginPage`)
- [x] Precondition steps identified (`goto()`)
- [x] Private helper extracts shared form interaction

---

## Cross-References

- **Companion ATC**: UPEX-106 (`loginWithInvalidCredentials`) — same component, negative path
- **Component**: `tests/components/ui/LoginPage.ts`
- **E2E test**: `tests/e2e/dashboard/dashboard.test.ts`
- **Guidelines**: `/test-automation` skill -- `references/test-design-principles.md`
