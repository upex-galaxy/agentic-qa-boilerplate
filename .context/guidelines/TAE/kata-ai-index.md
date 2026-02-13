# KATA AI Guide

> Entry point for AI agents to understand and implement KATA framework.

---

## Quick Orientation

**What is KATA?**

KATA (Komponent Action Test Architecture) is a test automation framework where:

- **ATCs** (Acceptance Test Cases) are **complete test flows**, NOT single clicks
- Each ATC = **One unique expected output** (Equivalence Partitioning)
- **Locators are inline** within ATCs, not in separate files
- Tests call ATCs, **ATCs don't call other ATCs**
- Uses **TC39 Stage 3 decorators** (`@atc('TEST-ID')`)

**Tech Stack:**

| Technology     | Purpose                                      |
| -------------- | -------------------------------------------- |
| **Bun**        | Runtime (auto-loads .env, native decorators) |
| **TypeScript** | Language (relaxed strict mode)               |
| **Playwright** | Test runner + browser automation             |
| **Allure**     | Reporting (optional)                         |

---

## Task-Based Navigation

| If you need to...                  | Read this document                                                |
| ---------------------------------- | ----------------------------------------------------------------- |
| Understand KATA concepts           | `kata-architecture.md` or `docs/kata-fundamentals.md`             |
| **Understand DI and lazy loading** | `docs/testing/automation/dependency-injection.md`                 |
| Create a new UI component          | `.prompts/stage-4-automation/e2e-test-automation-coding.md`       |
| Create a new API component         | `.prompts/stage-4-automation/integration-test-automation-coding.md` |
| Know naming conventions            | `automation-standards.md` (section 2)                             |
| See anti-patterns (what NOT to do) | `automation-standards.md` (section 11)                            |
| Adapt KATA to your project         | `.prompts/setup/kata-framework-adaptation.md`                     |
| Review ATC fundamental rules       | `automation-standards.md` (section 1)                             |
| Understand test data strategy      | `test-data-management.md`                                         |
| Learn about Flows module           | `automation-standards.md` (section 1.7)                           |
| Configure TMS integration          | `tms-integration.md`                                              |
| Configure CI/CD                    | `ci-cd-integration.md`                                            |
| Configure OpenAPI/MCP              | `openapi-integration.md`                                          |
| See existing components/ATCs       | Run `bun run kata:manifest`                                       |

---

## Critical Rules Summary

### 1. ATC = Complete Test Case

An ATC is a **mini-flow**, not a single interaction:

```typescript
// ❌ WRONG - Single interaction, NOT an ATC
@atc('PROJ-001')
async clickLoginButton() {
  await this.page.click('#login');
}

// ✅ CORRECT - Complete test case
@atc('PROJ-001')
async loginWithValidCredentials(credentials: Credentials) {
  await this.goto();
  await this.page.fill('#email', credentials.email);
  await this.page.fill('#password', credentials.password);
  await this.page.click('button[type="submit"]');
  await expect(this.page).toHaveURL(/.*dashboard.*/);
}
```

### 2. Equivalence Partitioning

**Same output = One parameterized ATC**

```typescript
// ❌ WRONG - 3 ATCs with same output (401 error)
@atc('PROJ-001') async loginWithWrongEmail() { /* → 401 */ }
@atc('PROJ-002') async loginWithWrongPassword() { /* → 401 */ }
@atc('PROJ-003') async loginWithEmptyFields() { /* → 401 */ }

// ✅ CORRECT - ONE ATC for invalid credentials
@atc('PROJ-001')
async loginWithInvalidCredentials(payload: LoginPayload) {
  // Test file parameterizes different invalid inputs
  // All lead to same output: 401 error
}
```

### 3. Locators Inline

No separate locator files. Locators go directly in ATCs:

```typescript
// ❌ WRONG - Separate locator file
// locators/login.ts
export const LOCATORS = { email: '#email', password: '#password' };

// ✅ CORRECT - Locators inline in ATC
@atc('PROJ-001')
async loginWithValidCredentials(data: LoginData) {
  await this.page.fill('#email', data.email);
  await this.page.fill('#password', data.password);
  await this.page.click('button[type="submit"]');
}
```

**Exception**: If a locator is used in **2+ ATCs**, extract to constructor:

```typescript
class LoginPage extends UiBase {
  // Shared locator (used in multiple ATCs)
  private readonly submitButton = () => this.page.locator('button[type="submit"]');

  @atc('PROJ-001')
  async loginSuccessfully(data: LoginData) {
    await this.submitButton().click();
  }

  @atc('PROJ-002')
  async loginWithInvalidCredentials(data: LoginData) {
    await this.submitButton().click();
  }
}
```

### 4. ATCs Don't Call ATCs

ATCs are atomic. Use **Flows module** for reusable flows:

```typescript
// ❌ WRONG - ATC calling another ATC
@atc('PROJ-001')
async checkoutWithNewUser() {
  await this.signupSuccessfully(userData);  // Another ATC!
  await this.addToCartSuccessfully(product);
}

// ✅ CORRECT - Use Flows module
// tests/components/flows/AuthFlows.ts
export class AuthFlows {
  constructor(private ui: UiFixture) {}

  async setupAuthenticatedUser(credentials: Credentials) {
    await this.ui.auth.loginSuccessfully(credentials);
    await this.ui.profile.completeOnboardingSuccessfully();
  }
}

// In test file:
test('checkout flow', async ({ ui }) => {
  const flows = new AuthFlows(ui);
  await flows.setupAuthenticatedUser(credentials);
  await ui.checkout.completeCheckoutSuccessfully();
});
```

### 5. No Retries, No Hardcoded Waits

```typescript
// ❌ WRONG
await page.waitForTimeout(3000); // Arbitrary wait

// ✅ CORRECT
await page.waitForSelector('[data-loaded="true"]');
await page.waitForResponse(resp => resp.url().includes('/api/data'));
```

```typescript
// playwright.config.ts
export default defineConfig({
  retries: 0, // Investigate failures, don't mask them
});
```

### 6. Import Aliases (Mandatory)

```typescript
// ✅ CORRECT - Always use aliases
import { config } from '@variables';
import { UiBase } from '@ui/UiBase';
import { atc } from '@utils/decorators';

// ❌ WRONG - No relative imports
import { config } from '../../../config/variables';
```

---

## Example Components (Copy These)

These files are marked as **EXAMPLE COMPONENT** and demonstrate all KATA principles:

| Type              | File                                    | What it demonstrates                                |
| ----------------- | --------------------------------------- | --------------------------------------------------- |
| **UI Component**  | `tests/components/ui/ExamplePage.ts`    | Inline locators, shared locators, `@atc` decorator  |
| **API Component** | `tests/components/api/ExampleApi.ts`    | Tuple returns, fixed assertions, type-safe generics |
| **Flows**         | `tests/components/flows/ExampleFlows.ts`| Reusable ATC chains                                 |

---

## Directory Structure Quick Reference

```
/config
│   └── variables.ts           # SINGLE SOURCE for env vars & URLs

/tests
├── /components                # KATA components
│   ├── TestContext.ts        # Layer 1: Utilities
│   ├── TestFixture.ts        # Layer 4: DI entry point
│   ├── /api
│   │   ├── ApiBase.ts        # Layer 2: HTTP helpers
│   │   └── AuthApi.ts        # Layer 3: Example API component
│   ├── /ui
│   │   ├── UiBase.ts         # Layer 2: Playwright helpers
│   │   └── ExamplePage.ts    # Layer 3: Example UI component
│   └── /flows
│       └── ExampleFlows.ts   # Layer 3.5: Reusable flows
│
├── /e2e                       # E2E tests (UI + API)
├── /integration               # API-only tests
├── /data                      # Test data files
└── /utils                     # Decorators, reporters
```

---

## Dependency Injection Quick Reference

> **Deep Dive**: See `/docs/testing/test-architecture/dependency-injection-strategy.md`

### Fixture Selection

| Test Type | Fixture to Use | Browser Opens? |
| --------- | -------------- | -------------- |
| API only  | `{ api }`      | No (lazy)      |
| UI only   | `{ ui }`       | Yes            |
| Hybrid    | `{ test }`     | Yes            |

```typescript
// API test - no browser overhead
test('get bookings', async ({ api }) => {
  await api.bookings.getAll();
});

// E2E test - browser opens
test('view bookings', async ({ ui }) => {
  await ui.bookings.navigateTo();
});

// Hybrid - shared context between API and UI
test('create via API, verify via UI', async ({ test: fixture }) => {
  const booking = await fixture.api.bookings.create(data);
  await fixture.ui.bookings.verifyExists(booking.id);
});
```

### Component Constructor Pattern

All components receive `TestContextOptions`:

```typescript
export class BookingsPage extends UiBase {
  constructor(options: TestContextOptions) {
    super(options); // Pass to parent
  }
}
```

### Instance Flow

```
Playwright → TestContextOptions → TestContext → Base → Component → Fixture → Test
              { page, request }     stores       getter   uses     composes  calls
```

---

## Naming Conventions Quick Reference

### Components

| Type          | Pattern         | Example                     |
| ------------- | --------------- | --------------------------- |
| UI Component  | `{Page}Page`    | `LoginPage`, `CheckoutPage` |
| API Component | `{Resource}Api` | `UsersApi`, `OrdersApi`     |
| Fixture       | `{Type}Fixture` | `TestFixture`, `ApiFixture` |

### ATCs

| Scenario      | Pattern                        | Example                         |
| ------------- | ------------------------------ | ------------------------------- |
| Success       | `{verb}{Resource}Successfully` | `loginSuccessfully()`           |
| Invalid Input | `{verb}With{Invalid}{X}`       | `loginWithInvalidCredentials()` |
| Not Found     | `{verb}WithNonExistent{X}`     | `getUserWithNonExistentId()`    |

### Test Files

| Type        | Pattern              | Example            |
| ----------- | -------------------- | ------------------ |
| E2E         | `{feature}.test.ts`  | `checkout.test.ts` |
| Integration | `{resource}.test.ts` | `auth.test.ts`     |

---

## Environment Configuration

**All environment configuration is in `config/variables.ts`**

```typescript
// Access configuration
import { config, env } from '@variables';

const baseUrl = config.baseUrl; // Selected by TEST_ENV
const apiUrl = config.apiUrl;
const testUser = config.testUser; // { email, password }
const isCI = env.isCI;
```

**Environment variables in `.env`:**

```bash
TEST_ENV=staging                    # Selects URLs from urlMap
TEST_USER_EMAIL=test@example.com    # Test account
TEST_USER_PASSWORD=secret123
```

---

## AI Implementation Workflow

For implementing ATCs from User Stories using the Playwright MCP, see:

- **E2E Tests**: `.prompts/stage-4-automation/e2e-test-automation-coding.md`
- **API Tests**: `.prompts/stage-4-automation/integration-test-automation-coding.md`

### Workflow Phases Overview

```
Phase -1: Project Discovery
    ↓  Detect project type, existing components, API docs
Phase 0: Context Gathering
    ↓  Fetch US from Jira, ask clarifying questions
Phase 0.5: Git Setup
    ↓  Create branch: test/[type]/[storyID]/[description]
Phase 1: UI Exploration (Playwright MCP)
    ↓  Navigate, snapshot, interact, capture locators
Phase 1.5: API Discovery
    ↓  OpenAPI spec, network requests, auth detection
Phase 2: Architecture Analysis
    ↓  Determine what files to create/modify
Phase 3: Component Generation
    ↓  Create UI/API components with ATCs
Phase 4: Test File Generation
    ↓  Create test files in e2e/ or integration/
Phase 5: Validation & Git Commit
       Run tests, verify KATA compliance, push & PR
```

### Key Tools Used

| Tool                            | Purpose                        |
| ------------------------------- | ------------------------------ |
| `mcp__playwright__*`            | UI exploration and interaction |
| `mcp__atlassian__*`             | Fetch US from Jira             |
| `Read/Write/Edit`               | File operations                |
| `Glob/Grep`                     | Search codebase                |
| `AskUserQuestion`               | Clarify requirements           |

---

## Auto-Generated Context

Run `bun run kata:manifest` to generate `kata-manifest.json` with:

- All components (API, UI, Flows)
- All ATCs with their Jira/Xray IDs
- File locations and method names

This provides context without scanning the entire codebase.

---

## References

| Document                                                     | Purpose                                     |
| ------------------------------------------------------------ | ------------------------------------------- |
| `docs/testing/test-architecture/kata-fundamentals.md`        | Conceptual KATA documentation               |
| `docs/testing/test-architecture/dependency-injection-strategy.md` | DI architecture and Playwright lazy loading |
| `kata-architecture.md`                                       | Full architecture documentation             |
| `automation-standards.md`                                    | All rules and standards                     |
| `openapi-integration.md`                                     | OpenAPI integration and MCP setup           |
| `kata-manifest.json` (root)                                  | Auto-generated component catalog            |
