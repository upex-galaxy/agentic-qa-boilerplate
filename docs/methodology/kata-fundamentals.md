# KATA: Component Action Test Architecture

**Component Action Test Architecture**

> _"Like a kata in martial arts, where each movement is practiced repeatedly until perfection, KATA Architecture converts system actions into reusable and precise blocks."_

---

> **Note**: This is the **conceptual fundamentals document** for KATA (Component Action Test Architecture).
> This document is for **reference only** - it provides philosophical and conceptual context.
> **AI agents should NOT load this automatically** - use TAE guidelines instead.
>
> For implementation-specific guides (mandatory for AI), see:
>
> - **AI Entry Point**: `.context/guidelines/TAE/kata-ai-index.md`
> - **Architecture**: `.context/guidelines/TAE/kata-architecture.md`
> - **Standards**: `.context/guidelines/TAE/automation-standards.md`
>
> All code examples use **TypeScript + Playwright + Bun**.

---

## 1. Philosophy and Vision

### Why does KATA exist?

Traditional test automation faces recurring problems:

- **Code duplication**: Writing the same flow multiple times across different tests
- **Costly maintenance**: System changes break dozens of tests
- **Disconnection from business**: Tests don't map directly to documented test cases
- **Lack of visibility**: You don't know which test cases passed or failed independently of the tests
- **Unclear architecture**: Mixed responsibilities between test logic, system interaction, and utilities

KATA solves these problems through two complementary strategies:

1. **Component Strategy**: Organizes code into clear layers with dependency injection
2. **Action Strategy**: Converts test cases into reusable actions with automatic traceability

### What problems does KATA solve

- **Scalable reusability**: Actions (ATCs) are shared across multiple tests
- **Direct traceability**: Each action maps 1:1 to a test case in your Test Management Tool
- **Clean architecture**: Clear separation between context, base components, specific components, and tests
- **Granular visibility**: Reports showing which actions passed or failed, not just which tests
- **Efficient maintenance**: Changes in functionality affect a single component
- **Flexibility**: Native support for both UI and API with the same philosophy

---

## 2. Fundamental Concepts

### 2.1 ATC (Acceptance Test Case)

An **ATC** is an automated acceptance test case that represents a **functional unit** of the system.

**Key characteristics:**

- Maps 1:1 to a test case in Jira/Xray, TestRail, or another Test Management Tool
- Contains steps, data, and expected results
- Is reusable across multiple tests
- Has embedded fixed assertions
- Executes as an atomic block that passes or fails

**Conceptual example:**

```
ATC: Create user successfully
├── Steps: POST /users with valid data
├── Data: name, email, password
└── Expected results:
    ├── Status 201
    ├── User returned with ID
    └── User exists in database
```

### 2.2 Shared Action

A **Shared Action** is an ATC implemented as a reusable method in code.

**Granularity criteria:**

- An action should represent a **cohesive functional unit** of the system
- Can involve one or multiple interactions if they are conceptually inseparable
- Should NOT be so large that it looks like a complete test
- Should NOT be so small that it loses business meaning

**Correct examples:**

- ✅ `login_successfully(username, password)` - a complete functionality
- ✅ `select_flight_dates(departure, arrival)` - two fields forming a unit
- ✅ `refund_payment_successfully(payment_id, amount)` - complete business operation

**Incorrect examples:**

- ❌ `open_menu_panel()` - too small, it's a technical interaction
- ❌ `complete_purchase_journey()` - too large, it's a complete E2E flow

### 2.3 Component

A **Component** is a class that encapsulates related functionality of the system under test.

**Component types:**

- **API Components**: Group related endpoints (UsersApi, LoansApi, PaymentsApi)
- **UI Components**: Group elements of a page or widget (LoginPage, CheckoutPage, HeaderNav)

Components follow the **Component Object Model (COM)** and contain ATCs as methods.

### 2.4 Fixture

A **Fixture** is the unified entry point that groups all components through **Dependency Injection**.

**Purpose:**

- Instantiate all components once
- Provide access to components from a single object
- Simplify imports in tests
- Inject common dependencies (TestContext, Base Classes)

**Usage example:**

```typescript
test('user journey', async ({ kata }) => {
  const user = await kata.api.users.createUserSuccessfully(data);
  await kata.ui.login.loginSuccessfully(user.email, user.password);
  await kata.ui.dashboard.verifyWelcomeMessage(user.name);
});
```

### 2.5 Fixed Assertions vs Test-Level Assertions

KATA defines two levels of validations:

**Fixed Assertions**

- Live **inside** ATCs
- Validate that the action worked correctly by itself
- Execute always when the ATC is used, regardless of which test
- Guarantee that the action's behavior is correct

**Test-Level Assertions**

- Live **in the test** that orchestrates multiple ATCs
- Validate the result of combining actions
- Verify the final state of the system after a complete flow
- Validate relationships between results from different actions

**Example:**

```typescript
test('refund reduces balance', async ({ api }) => {
  // Action 1: Create loan (with internal fixed assertions)
  const [, loan] = await api.loans.createLoanSuccessfully({ amount: 1000 });

  // Action 2: Process refund (with internal fixed assertions)
  await api.payments.refundPaymentSuccessfully({
    loanId: loan.id,
    amount: 200,
  });

  // Test-level assertion: validate the combined effect
  const [, updatedLoan] = await api.loans.getLoan(loan.id);
  expect(updatedLoan.balance).toBe(800);
});
```

### 2.6 Soft Fail

**Soft Fail** allows an ATC to fail but the test continues executing.

**Use cases:**

- Optional fields in long forms
- Non-critical validations in E2E flows
- Exploratory tests where you want to see all failures, not just the first one

**Implementation:**

```typescript
@atc('JIRA-123', { softFail: true })
async fillOptionalSection(data: FormData) {
  // If it fails, the error is captured but the test continues
}
```

---

## 3. Layer Architecture (Component Strategy)

KATA organizes code into hierarchical layers with clear responsibilities.

### 3.1 Layer Diagram

```
┌─────────────────────────────────────────────────────┐
│                  Test Files Layer                   │
│       (auth.test.ts, checkout.test.ts)              │
└────────────────────┬────────────────────────────────┘
                     │ imports unified fixture
                     ▼
┌─────────────────────────────────────────────────────┐
│            Fixture Layer (Recommended)              │
│   TestFixture (Unified) - DI Entry Point            │
│   ├── api: ApiFixture                               │
│   └── ui: UiFixture (if page available)             │
└────────┬────────────────────────────────────────────┘
         │ instantiates components
         ▼
┌─────────────────────────────────────────────────────┐
│            Specific Components Layer                │
│    (UsersApi, LoansApi, LoginPage, CheckoutPage)    │
│              ← ATCs live here                       │
└────────┬────────────────────────────────────────────┘
         │ inherits from
         ▼
┌─────────────────────────────────────────────────────┐
│               Base Components Layer                 │
│             (ApiBase, UiBase) - Helpers             │
└────────┬────────────────────────────────────────────┘
         │ inherits from
         ▼
┌─────────────────────────────────────────────────────┐
│              Test Context Layer                     │
│   (TestContext) - Config, Logger, HTTP, Faker       │
└─────────────────────────────────────────────────────┘
```

### 3.2 Layer 1: Test Context

**Purpose**: Provide global configuration and shared utilities for any type of test.

**Content:**

- Environment variables
- Environment configuration (local, staging, production)
- Data generators (Faker)
- Cross-cutting utilities

**Implementation:**

```typescript
// tests/components/TestContext.ts
import { faker } from '@faker-js/faker';
import { config, type Environment } from '@config/variables';

export class TestContext {
  readonly config = config;
  readonly faker = faker;
  protected environment: Environment;

  constructor(environment?: Environment) {
    this.environment = environment ?? config.environment;
  }

  generateUserData() {
    return {
      name: this.faker.person.fullName(),
      email: `test_${Date.now()}_${this.faker.internet.email()}`,
      password: this.faker.internet.password({ length: 12 }),
    };
  }
}
```

**When to add code here:**

- You need something available for **all** test types (UI and API)
- It's global configuration or shared state
- It's not specific to API or UI

### 3.3 Layer 2: Base Components

**Purpose**: Provide helpers and common functionality for a specific interaction type (API or UI).

#### ApiBase - REST Helpers

```typescript
// tests/components/api/ApiBase.ts
import { request, type APIResponse, type APIRequestContext } from '@playwright/test';
import { TestContext } from '@components/TestContext';

export class ApiBase extends TestContext {
  protected requestContext!: APIRequestContext;

  protected async apiGET<T>(endpoint: string): Promise<[APIResponse, T]> {
    const ctx = await this.getRequestContext();
    const response = await ctx.get(this.buildApiUrl(endpoint));
    const body = (await response.json()) as T;
    return [response, body];
  }

  protected async apiPOST<T, P>(endpoint: string, payload: P): Promise<[APIResponse, T, P]> {
    const ctx = await this.getRequestContext();
    const response = await ctx.post(this.buildApiUrl(endpoint), { data: payload });
    const body = (await response.json()) as T;
    return [response, body, payload];
  }

  private buildApiUrl(endpoint: string): string {
    return `${this.config.apiUrl}${endpoint}`;
  }

  private async getRequestContext(): Promise<APIRequestContext> {
    if (!this.requestContext) {
      this.requestContext = await request.newContext();
    }
    return this.requestContext;
  }
}
```

#### UiBase - UI Helpers

```typescript
// tests/components/ui/UiBase.ts
import { type Page } from '@playwright/test';
import { TestContext } from '@components/TestContext';

export class UiBase extends TestContext {
  readonly page: Page;

  constructor(page: Page, environment?: Environment) {
    super(environment);
    this.page = page;
  }

  protected buildUrl(path: string): string {
    return `${this.config.baseUrl}${path}`;
  }

  async goto(path: string = '/') {
    await this.page.goto(this.buildUrl(path));
  }
}
```

**When to add code here:**

- Functionality common to **all** API or UI components
- Library wrappers (requests, Playwright)
- Technical utility methods (logging, timeouts, retries)

### 3.4 Layer 3: Specific Components

**Purpose**: Encapsulate functionality of a specific system area. **ATCs live here.**

#### API Components

```typescript
// tests/components/api/UsersApi.ts
import { expect, type APIResponse } from '@playwright/test';
import { ApiBase } from '@components/api/ApiBase';
import { atc } from '@utils/decorators';

interface User {
  id: string;
  name: string;
  email: string;
}

interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
}

export class UsersApi extends ApiBase {
  /**
   * ATC: Create user with valid data.
   * Fixed Validations: Status 201, ID present, email correct
   */
  @atc('USER-001')
  async createUserSuccessfully(
    payload: CreateUserPayload
  ): Promise<[APIResponse, User, CreateUserPayload]> {
    const [response, body, sentPayload] = await this.apiPOST<User, CreateUserPayload>(
      '/users',
      payload
    );

    // Fixed Assertions
    expect(response.status()).toBe(201);
    expect(body.id).toBeDefined();
    expect(body.email).toBe(payload.email);

    return [response, body, sentPayload];
  }

  @atc('USER-002')
  async getUserSuccessfully(userId: string): Promise<[APIResponse, User]> {
    const [response, body] = await this.apiGET<User>(`/users/${userId}`);

    // Fixed Assertions
    expect(response.status()).toBe(200);
    expect(body.id).toBe(userId);

    return [response, body];
  }
}
```

#### UI Components

```typescript
// tests/components/ui/LoginPage.ts
import { expect, type Page } from '@playwright/test';
import { UiBase } from '@components/ui/UiBase';
import { atc } from '@utils/decorators';

interface Credentials {
  email: string;
  password: string;
}

export class LoginPage extends UiBase {
  // Inline locators (used in multiple ATCs, extracted to constructor)
  private readonly emailInput = () => this.page.locator('#email');
  private readonly passwordInput = () => this.page.locator('#password');
  private readonly submitButton = () => this.page.locator('button[type="submit"]');
  private readonly errorMessage = () => this.page.locator('.error-message');

  /**
   * ATC: Login with valid credentials.
   * Fixed Validations: Redirect to dashboard, no errors
   */
  @atc('AUTH-001')
  async loginSuccessfully(credentials: Credentials): Promise<void> {
    await this.goto('/login');

    // ACT
    await this.emailInput().fill(credentials.email);
    await this.passwordInput().fill(credentials.password);
    await this.submitButton().click();

    // Fixed Assertions
    await expect(this.page).toHaveURL(/.*dashboard.*/);
    await expect(this.errorMessage()).not.toBeVisible();
  }
}
```

**When to create a new component:**

- Groups related endpoints (UsersApi, PaymentsApi)
- Groups elements of a page or widget (CheckoutPage, HeaderNav)
- Represents a functional area of the system
- Contains multiple related ATCs

**Internal component structure:**

- **Locators/Endpoints**: Constants at the beginning (only for UI)
- **ATCs**: Public methods with `@atc` decorator
- **Private helpers**: Internal methods without decorator (if necessary)

### 3.5 Layer 4: Fixture (Dependency Injection)

**Purpose**: Unified entry point that instantiates all components and makes them accessible from a single object.

#### ApiFixture

```typescript
// tests/components/ApiFixture.ts
import { ApiBase } from '@components/api/ApiBase';
import { UsersApi } from '@components/api/UsersApi';
import { LoansApi } from '@components/api/LoansApi';
import { PaymentsApi } from '@components/api/PaymentsApi';

export class ApiFixture extends ApiBase {
  readonly users: UsersApi;
  readonly loans: LoansApi;
  readonly payments: PaymentsApi;

  constructor() {
    super();
    // Dependency Injection: each component inherits config from parent
    this.users = new UsersApi();
    this.loans = new LoansApi();
    this.payments = new PaymentsApi();
  }
}
```

#### UiFixture

```typescript
// tests/components/UiFixture.ts
import { type Page } from '@playwright/test';
import { UiBase } from '@components/ui/UiBase';
import { LoginPage } from '@components/ui/LoginPage';
import { CheckoutPage } from '@components/ui/CheckoutPage';
import { DashboardPage } from '@components/ui/DashboardPage';

export class UiFixture extends UiBase {
  readonly login: LoginPage;
  readonly checkout: CheckoutPage;
  readonly dashboard: DashboardPage;

  constructor(page: Page) {
    super(page);
    // Dependency Injection: each component receives page
    this.login = new LoginPage(page);
    this.checkout = new CheckoutPage(page);
    this.dashboard = new DashboardPage(page);
  }
}
```

**Dependency Injection principle:**

The Fixture implements DI by:

1. Receiving dependencies in its constructor (env, page)
2. Instantiating components passing them those dependencies
3. Components do NOT create their own dependencies
4. Result: decoupling and testability

### 3.6 Layer 5: Test Files

**Purpose**: Orchestrate ATCs to validate complete business flows.

#### Configuration in conftest.py

```python
# conftest.py
import pytest
from components.api_fixture import ApiFixture
from components.page_fixture import PageFixture

@pytest.fixture(scope="session")
def env():
    return os.getenv("TEST_ENV", "dev")

@pytest.fixture(scope="function")
def api(env):
    """Fixture for API integration tests."""
    return ApiFixture(env)

@pytest.fixture(scope="function")
def ui(page, env):
    """Fixture for E2E tests with UI."""
    return PageFixture(page, env)
```

#### Integration Test (API)

```python
# tests/integration/test_loans.py

def test_refund_updates_balance(fixture):
    """
    Integration test: Verify that a refund updates the balance.

    Flow:
        1. Create loan
        2. Make refund
        3. Verify updated balance
    """
    # Action 1: Create loan (with fixed assertions)
    loan = fixture.api.loans.create_loan_successfully(
        user_id=123,
        amount=1000,
        term_months=12
    )

    # Action 2: Process refund (with fixed assertions)
    refund = fixture.api.payments.refund_payment_successfully(
        loan_id=loan["id"],
        amount=200
    )

    # Test-level assertion: Validate combined effect
    updated_loan = fixture.api.loans.get_loan_successfully(loan["id"])
    assert updated_loan["balance"] == 800, \
        f"Expected balance 800, got {updated_loan['balance']}"
```

#### E2E Test (UI + API)

```python
# tests/e2e/test_purchase_journey.py

def test_complete_purchase_journey(fixture):
    """
    E2E Test: Complete purchase journey.

    Flow:
        1. Create user via API (fast setup)
        2. Login via UI
        3. Add product to cart via UI
        4. Complete purchase via UI
        5. Verify order via API
    """
    # Setup: Create user via API (faster than UI)
    user = fixture.api.users.create_user_successfully(
        name="Test User",
        email=f"test_{uuid4()}@example.com",
        password="SecurePass123"
    )

    # Login via UI
    fixture.ui.login.login_successfully(user["email"], "SecurePass123")

    # Add product
    fixture.ui.checkout.add_product_to_cart("Laptop Pro", quantity=1)

    # Complete purchase
    order = fixture.ui.checkout.complete_purchase_successfully(
        payment_method="credit_card"
    )

    # Verify via API (more reliable than UI)
    order_details = fixture.api.orders.get_order_successfully(order["id"])
    assert order_details["status"] == "completed"
    assert order_details["total_amount"] == 1500
```

---

## 4. Directory Structure

```
project/
├── components/                      # All KATA components
│   ├── testcontext.py              # Layer 1: Core plumbing
│   │
│   ├── api_fixture.py              # Layer 4: API Fixture (DI)
│   ├── ui_fixture.py               # Layer 4: UI Fixture (DI)
│   ├── test_fixture.py             # Layer 4: Unified fixture (RECOMMENDED)
│   │
│   ├── api/                        # Layer 2 & 3: API Components
│   │   ├── api_base.py            # Layer 2: REST Helpers
│   │   ├── users_api.py           # Layer 3: Component with ATCs
│   │   ├── loans_api.py           # Layer 3: Component with ATCs
│   │   ├── payments_api.py        # Layer 3: Component with ATCs
│   │   └── ...
│   │
│   └── ui/                         # Layer 2 & 3: UI Components
│       ├── ui_base.py             # Layer 2: UI Helpers
│       ├── login_page.py          # Layer 3: Component with ATCs
│       ├── checkout_page.py       # Layer 3: Component with ATCs
│       ├── dashboard_page.py      # Layer 3: Component with ATCs
│       └── ...
│
├── tests/                          # Layer 5: Test Files
│   ├── integration/               # Integration tests (API only)
│   │   ├── test_loans.py
│   │   ├── test_payments.py
│   │   └── ...
│   │
│   └── e2e/                       # End-to-end tests (UI + API)
│       ├── test_purchase_journey.py
│       ├── test_user_onboarding.py
│       └── ...
│
├── utils/                         # Auxiliary functions without traceability
│   ├── data_generators.py        # Helpers for generating data
│   ├── validators.py             # Custom validators
│   ├── decorators.py             # @atc decorator and report generation
│   └── tms_sync.py               # Synchronization with TMS
│
├── config/                        # Configuration by environment
│   ├── dev.yaml
│   ├── staging.yaml
│   └── prod.yaml
│
├── reports/                       # Generated reports
│   └── atc_results.json
│
├── .env                          # Environment variables
├── conftest.py                    # Pytest fixtures
├── pytest.ini                     # Pytest configuration
└── requirements.txt               # Dependencies
```

---

## 5. Traceability System (Action Strategy)

### 5.1 @atc Decorator

The `@atc` decorator is the mechanism that connects code with the Test Management Tool.

**Purpose:**

- Map each ATC method to its test case in Jira/Xray/TestRail
- Capture execution results (pass/fail)
- Generate granular report independent of tests
- Enable soft-fail when necessary

**Implementation:**

```python
# utils/decorators.py
import functools
import json
from typing import Callable, Optional

# Global variable to store results (thread-safe with locks)
from threading import Lock
ATC_RESULTS = {}
ATC_LOCK = Lock()

def atc(test_id: str, soft_fail: bool = False):
    """
    Decorator to mark a method as traceable ATC.

    Args:
        test_id: Test case ID in Test Management Tool
        soft_fail: If True, captures errors but allows to continue
    """
    def decorator(func: Callable):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            result = {
                "test_id": test_id,
                "method": func.__name__,
                "status": None,
                "error": None,
                "executed_at": None
            }

            try:
                # Execute the ATC
                from datetime import datetime
                result["executed_at"] = datetime.now().isoformat()

                return_value = func(*args, **kwargs)

                # ATC passed successfully
                result["status"] = "PASS"
                _store_result(test_id, result)

                return return_value

            except Exception as e:
                # ATC failed
                result["status"] = "FAIL"
                result["error"] = str(e)
                _store_result(test_id, result)

                if soft_fail:
                    # Capture error but continue
                    print(f"⚠️  SOFT FAIL - {test_id}: {str(e)}")
                    return None
                else:
                    # Re-raise the exception
                    raise

        return wrapper
    return decorator

def _store_result(test_id: str, result: dict):
    """Store result in thread-safe manner."""
    with ATC_LOCK:
        if test_id not in ATC_RESULTS:
            ATC_RESULTS[test_id] = []
        ATC_RESULTS[test_id].append(result)

def generate_atc_report(output_path: str = "atc_results.json"):
    """Generate JSON report with results from all ATCs."""
    with ATC_LOCK:
        with open(output_path, "w") as f:
            json.dump(ATC_RESULTS, f, indent=2)

    print(f"📊 ATC Report generated: {output_path}")
```

**Pytest hook to generate report:**

```python
# conftest.py
import pytest
from utils.decorators import generate_atc_report

def pytest_sessionfinish(session, exitstatus):
    """Generate ATC report at the end of pytest session."""
    generate_atc_report("reports/atc_results.json")
```

### 5.2 Using the decorator

```python
# components/api/loans_api.py
from utils.decorators import atc

class LoansApi(ApiBase):

    @atc(test_id="LOAN-001")
    def create_loan_successfully(self, user_id: int, amount: float):
        """Traceable ATC that always reports its result."""
        # ... implementation with fixed assertions
        pass

    @atc(test_id="LOAN-002", soft_fail=True)
    def verify_optional_field(self, loan_id: int):
        """ATC with soft-fail: fails but allows to continue."""
        # If it fails, it's logged but doesn't stop the test
        pass
```

### 5.3 JSON Report Format

```json
{
  "LOAN-001": [
    {
      "test_id": "LOAN-001",
      "method": "create_loan_successfully",
      "status": "PASS",
      "error": null,
      "executed_at": "2025-01-29T10:30:45.123456"
    },
    {
      "test_id": "LOAN-001",
      "method": "create_loan_successfully",
      "status": "FAIL",
      "error": "AssertionError: Expected 201, got 500",
      "executed_at": "2025-01-29T10:35:12.789012"
    }
  ],
  "USER-001": [
    {
      "test_id": "USER-001",
      "method": "create_user_successfully",
      "status": "PASS",
      "error": null,
      "executed_at": "2025-01-29T10:28:30.456789"
    }
  ]
}
```

**Interpretation:**

- `LOAN-001` was executed 2 times: 1 pass, 1 fail
- `USER-001` was executed 1 time: 1 pass
- Each execution has timestamp and error details if it failed

### 5.4 Integration with Test Management Tools

KATA supports multiple Test Management Tools. The template is configured for **Xray** (Jira integration), but you can easily switch to TestRail or other TMS solutions.

```python
# utils/tms_sync.py
"""
Test Management Tools synchronization system.

ACTIVE CONFIGURATION: Xray Cloud
To use another TMS, comment Xray code and uncomment the one you need.
"""
import requests
import json
import os
from datetime import datetime

def sync_results(report_path: str = "reports/atc_results.json"):
    """
    Synchronize ATC results with Test Management Tool.

    Required environment variables:
        AUTO_SYNC: "true" to enable automatic synchronization

        For Xray Cloud (ACTIVE):
            XRAY_CLIENT_ID: Xray Client ID
            XRAY_CLIENT_SECRET: Xray Client Secret
            XRAY_PROJECT_KEY: Project key (e.g.: "DEMO")
    """
    if not os.getenv("AUTO_SYNC") == "true":
        print("⏭️  Auto-sync disabled. Set AUTO_SYNC=true to enable.")
        return

    with open(report_path, "r") as f:
        results = json.load(f)

    # ==================== XRAY CLOUD (ACTIVE) ====================
    _sync_to_xray_cloud(results)

    # ==================== OTHER OPTIONS (COMMENTED) ====================
    # Uncomment the method you need and comment Xray above

    # _sync_to_testrail(results)
    # _sync_to_jira_customfield(results)
    # _sync_to_jira_transition(results)


# ============================================================
#                    XRAY CLOUD SYNC (ACTIVE)
# ============================================================

def _sync_to_xray_cloud(results: dict):
    """
    Synchronize with Xray Cloud using native JSON format.

    Documentation: https://docs.getxray.app/display/XRAYCLOUD/Import+Execution+Results
    """
    client_id = os.getenv("XRAY_CLIENT_ID")
    client_secret = os.getenv("XRAY_CLIENT_SECRET")
    project_key = os.getenv("XRAY_PROJECT_KEY")

    # 1. Authenticate and get token
    auth_url = "https://xray.cloud.getxray.app/api/v2/authenticate"
    auth_payload = {
        "client_id": client_id,
        "client_secret": client_secret
    }

    auth_response = requests.post(auth_url, json=auth_payload)
    if auth_response.status_code != 200:
        print(f"❌ Xray authentication failed: {auth_response.text}")
        return

    token = auth_response.json()

    # 2. Prepare payload in Xray JSON format
    xray_payload = {
        "info": {
            "project": project_key,
            "summary": f"KATA Execution - {os.getenv('BUILD_ID', datetime.now().strftime('%Y%m%d-%H%M%S'))}",
            "description": "Automated test execution via KATA Architecture"
        },
        "tests": []
    }

    # 3. Convert KATA results to Xray format
    for test_id, executions in results.items():
        final_status = "PASS"
        last_error = None

        for execution in executions:
            if execution["status"] == "FAIL":
                final_status = "FAIL"
                last_error = execution.get("error", "Test failed")
                break

        xray_status = "PASSED" if final_status == "PASS" else "FAILED"

        test_entry = {
            "testKey": test_id,
            "status": xray_status,
            "comment": f"🤖 KATA ATC: {executions[0]['method']}\n"
                      f"📊 Executions: {len(executions)}\n"
                      f"⏱️  Last execution: {executions[-1]['executed_at']}"
        }

        if last_error:
            test_entry["comment"] += f"\n\n❌ Error:\n{last_error}"

        xray_payload["tests"].append(test_entry)

    # 4. Import results
    import_url = "https://xray.cloud.getxray.app/api/v2/import/execution"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    response = requests.post(import_url, headers=headers, json=xray_payload)

    if response.status_code in [200, 201]:
        result = response.json()
        print(f"✅ Results synced to Xray Cloud successfully")
        print(f"   Test Execution: {result.get('key', 'N/A')}")
    else:
        print(f"❌ Xray sync failed: {response.status_code}")
        print(f"   {response.text}")


# ============================================================
#              TESTRAIL SYNC (COMMENTED - AVAILABLE)
# ============================================================

# def _sync_to_testrail(results: dict):
#     """
#     Synchronize with TestRail using add_results_for_cases API.
#
#     Environment variables:
#         TESTRAIL_URL: Your instance URL (e.g.: https://company.testrail.io)
#         TESTRAIL_USER: User email
#         TESTRAIL_API_KEY: TestRail API Key
#         TESTRAIL_PROJECT_ID: Project ID
#         TESTRAIL_RUN_ID: (optional) Test run ID, creates new if doesn't exist
#
#     Documentation: https://support.testrail.com/hc/en-us/articles/7077819312404
#     """
#     url = os.getenv("TESTRAIL_URL")
#     user = os.getenv("TESTRAIL_USER")
#     api_key = os.getenv("TESTRAIL_API_KEY")
#     project_id = os.getenv("TESTRAIL_PROJECT_ID")
#     run_id = os.getenv("TESTRAIL_RUN_ID")
#
#     # If no run_id, create a new test run
#     if not run_id:
#         run_payload = {
#             "name": f"KATA Execution - {datetime.now().strftime('%Y-%m-%d %H:%M')}",
#             "description": "Automated execution via KATA Architecture",
#             "include_all": True
#         }
#
#         create_url = f"{url}/index.php?/api/v2/add_run/{project_id}"
#         response = requests.post(
#             create_url,
#             auth=(user, api_key),
#             headers={"Content-Type": "application/json"},
#             json=run_payload
#         )
#
#         if response.status_code == 200:
#             run_id = response.json()["id"]
#             print(f"📊 Created TestRail run: {run_id}")
#         else:
#             print(f"❌ Failed to create run: {response.text}")
#             return
#
#     # Prepare results
#     testrail_results = []
#
#     for test_id, executions in results.items():
#         final_status = "pass"
#         error_msg = None
#
#         for execution in executions:
#             if execution["status"] == "FAIL":
#                 final_status = "fail"
#                 error_msg = execution.get("error", "Test failed")
#                 break
#
#         # TestRail status_id: 1=Passed, 5=Failed
#         status_id = 1 if final_status == "pass" else 5
#
#         # Extract numeric case_id from test_id (e.g.: "TC-123" → 123)
#         case_id = int(test_id.split("-")[-1])
#
#         comment = (
#             f"🤖 KATA ATC: {executions[0]['method']}\n"
#             f"📊 Executions: {len(executions)}\n"
#             f"⏱️  Duration: {executions[-1]['executed_at']}"
#         )
#
#         if error_msg:
#             comment += f"\n\n❌ Error:\n{error_msg}"
#
#         testrail_results.append({
#             "case_id": case_id,
#             "status_id": status_id,
#             "comment": comment
#         })
#
#     # Send results
#     results_url = f"{url}/index.php?/api/v2/add_results_for_cases/{run_id}"
#     response = requests.post(
#         results_url,
#         auth=(user, api_key),
#         headers={"Content-Type": "application/json"},
#         json={"results": testrail_results}
#     )
#
#     if response.status_code == 200:
#         print(f"✅ Results synced to TestRail successfully")
#         print(f"   Test Run: {url}/index.php?/runs/view/{run_id}")
#     else:
#         print(f"❌ TestRail sync failed: {response.text}")


# ============================================================
#         JIRA CUSTOM FIELD SYNC (COMMENTED - AVAILABLE)
# ============================================================

# def _sync_to_jira_customfield(results: dict):
#     """
#     Synchronize with Jira updating custom field + adding comments.
#
#     Jira configuration:
#         1. Create custom field type "Select List (single choice)"
#         2. Name: "Test Status" (or similar)
#         3. Options: PASS, FAIL, BLOCKED, NOT_RUN
#         4. Get custom field ID (e.g.: customfield_10100)
#
#     Environment variables:
#         JIRA_URL: Your instance URL (e.g.: https://company.atlassian.net)
#         JIRA_USER: User email
#         JIRA_API_TOKEN: Jira API Token
#         JIRA_TEST_STATUS_FIELD: Custom field ID (e.g.: customfield_10100)
#
#     Documentation: https://developer.atlassian.com/cloud/jira/platform/rest/v3/
#     """
#     jira_url = os.getenv("JIRA_URL")
#     jira_user = os.getenv("JIRA_USER")
#     jira_token = os.getenv("JIRA_API_TOKEN")
#     custom_field_id = os.getenv("JIRA_TEST_STATUS_FIELD", "customfield_10100")
#
#     auth = (jira_user, jira_token)
#     headers = {"Content-Type": "application/json"}
#
#     for test_id, executions in results.items():
#         final_status = "PASS"
#         error_msg = None
#
#         for execution in executions:
#             if execution["status"] == "FAIL":
#                 final_status = "FAIL"
#                 error_msg = execution.get("error", "Test failed")
#                 break
#
#         # 1. Update custom field
#         update_url = f"{jira_url}/rest/api/3/issue/{test_id}"
#         update_payload = {
#             "fields": {
#                 custom_field_id: {"value": final_status}
#             }
#         }
#
#         response = requests.put(update_url, auth=auth, headers=headers, json=update_payload)
#
#         if response.status_code != 204:
#             print(f"❌ Failed to update {test_id}: {response.text}")
#             continue
#
#         # 2. Add comment with execution history
#         comment_url = f"{jira_url}/rest/api/3/issue/{test_id}/comment"
#
#         comment_body = {
#             "body": {
#                 "type": "doc",
#                 "version": 1,
#                 "content": [
#                     {
#                         "type": "paragraph",
#                         "content": [
#                             {
#                                 "type": "text",
#                                 "text": f"🤖 KATA Execution Result\n",
#                                 "marks": [{"type": "strong"}]
#                             }
#                         ]
#                     },
#                     {
#                         "type": "paragraph",
#                         "content": [
#                             {"type": "text", "text": f"Status: {final_status}\n"},
#                             {"type": "text", "text": f"ATC Method: {executions[0]['method']}\n"},
#                             {"type": "text", "text": f"Executions: {len(executions)}\n"},
#                             {"type": "text", "text": f"Timestamp: {executions[-1]['executed_at']}"}
#                         ]
#                     }
#                 ]
#             }
#         }
#
#         if error_msg:
#             comment_body["body"]["content"].append({
#                 "type": "paragraph",
#                 "content": [
#                     {"type": "text", "text": "\n❌ Error Details:\n", "marks": [{"type": "strong"}]},
#                     {"type": "text", "text": error_msg}
#                 ]
#             })
#
#         comment_response = requests.post(comment_url, auth=auth, headers=headers, json=comment_body)
#
#         if comment_response.status_code == 201:
#             print(f"✅ Updated {test_id} → {final_status} (with comment)")
#         else:
#             print(f"⚠️  Updated {test_id} but failed to add comment")


# ============================================================
#      JIRA TRANSITION SYNC (COMMENTED - AVAILABLE)
# ============================================================

# def _sync_to_jira_transition(results: dict):
#     """
#     Synchronize with Jira executing workflow transitions + adding comments.
#
#     Jira configuration (Recommended option with subtasks):
#         1. Create issue type "Test Suite"
#         2. Test cases are subtasks of suite
#         3. Subtasks have workflow with transitions:
#            - "Mark as Pass" (id: 31)
#            - "Mark as Fail" (id: 41)
#         4. Final states: PASS, FAIL, BLOCKED
#
#     Environment variables:
#         JIRA_URL: Your instance URL
#         JIRA_USER: User email
#         JIRA_API_TOKEN: API Token
#         JIRA_TRANSITION_PASS: Transition ID to PASS (default: 31)
#         JIRA_TRANSITION_FAIL: Transition ID to FAIL (default: 41)
#
#     Note: Transition IDs vary by configured workflow.
#     To get them: GET /rest/api/3/issue/{test_id}/transitions
#
#     Documentation: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-transitions-post
#     """
#     jira_url = os.getenv("JIRA_URL")
#     jira_user = os.getenv("JIRA_USER")
#     jira_token = os.getenv("JIRA_API_TOKEN")
#
#     transition_ids = {
#         "PASS": os.getenv("JIRA_TRANSITION_PASS", "31"),
#         "FAIL": os.getenv("JIRA_TRANSITION_FAIL", "41")
#     }
#
#     auth = (jira_user, jira_token)
#     headers = {"Content-Type": "application/json"}
#
#     for test_id, executions in results.items():
#         final_status = "PASS"
#         error_msg = None
#
#         for execution in executions:
#             if execution["status"] == "FAIL":
#                 final_status = "FAIL"
#                 error_msg = execution.get("error", "Test failed")
#                 break
#
#         target_transition_id = transition_ids[final_status]
#
#         # 1. Check available transitions
#         transitions_url = f"{jira_url}/rest/api/3/issue/{test_id}/transitions"
#         response = requests.get(transitions_url, auth=auth)
#
#         if response.status_code != 200:
#             print(f"❌ Failed to get transitions for {test_id}")
#             continue
#
#         available = response.json()["transitions"]
#         transition_exists = any(t["id"] == target_transition_id for t in available)
#
#         if not transition_exists:
#             print(f"⚠️  Transition {target_transition_id} not available for {test_id}")
#             continue
#
#         # 2. Execute transition
#         transition_payload = {
#             "transition": {"id": target_transition_id}
#         }
#
#         response = requests.post(transitions_url, auth=auth, headers=headers, json=transition_payload)
#
#         if response.status_code != 204:
#             print(f"❌ Failed to transition {test_id}: {response.text}")
#             continue
#
#         # 3. Add comment with execution details
#         comment_url = f"{jira_url}/rest/api/3/issue/{test_id}/comment"
#
#         comment_body = {
#             "body": {
#                 "type": "doc",
#                 "version": 1,
#                 "content": [
#                     {
#                         "type": "paragraph",
#                         "content": [
#                             {
#                                 "type": "text",
#                                 "text": f"🤖 KATA Execution - {final_status}\n",
#                                 "marks": [{"type": "strong"}]
#                             }
#                         ]
#                     },
#                     {
#                         "type": "paragraph",
#                         "content": [
#                             {"type": "text", "text": f"ATC: {executions[0]['method']}\n"},
#                             {"type": "text", "text": f"Executions: {len(executions)}\n"},
#                             {"type": "text", "text": f"Last run: {executions[-1]['executed_at']}\n"},
#                             {"type": "text", "text": f"Build: {os.getenv('BUILD_ID', 'Local')}"}
#                         ]
#                     }
#                 ]
#             }
#         }
#
#         if error_msg:
#             comment_body["body"]["content"].append({
#                 "type": "codeBlock",
#                 "attrs": {"language": "text"},
#                 "content": [
#                     {"type": "text", "text": f"Error:\n{error_msg}"}
#                 ]
#             })
#
#         comment_response = requests.post(comment_url, auth=auth, headers=headers, json=comment_body)
#
#         if comment_response.status_code == 201:
#             print(f"✅ Transitioned {test_id} → {final_status} (with comment)")
#         else:
#             print(f"⚠️  Transitioned {test_id} but failed to add comment")


# ============================================================
#                    HOOK FOR PYTEST
# ============================================================

# Hook in conftest.py to execute automatically
def pytest_sessionfinish(session, exitstatus):
    """
    Pytest hook executed at the end of all tests.
    Generates report and synchronizes with TMS.
    """
    from utils.decorators import generate_atc_report

    # Generate JSON report of ATCs
    generate_atc_report("reports/atc_results.json")

    # Synchronize with TMS
    sync_results("reports/atc_results.json")
```

#### Environment variables configuration

Create a `.env` file at project root:

```bash
# .env

# ===== Enable automatic synchronization =====
AUTO_SYNC=true

# ===== XRAY CLOUD (ACTIVE) =====
XRAY_CLIENT_ID=your_client_id_here
XRAY_CLIENT_SECRET=your_client_secret_here
XRAY_PROJECT_KEY=DEMO

# ===== TESTRAIL (DISABLED) =====
# TESTRAIL_URL=https://company.testrail.io
# TESTRAIL_USER=user@company.com
# TESTRAIL_API_KEY=your_api_key_here
# TESTRAIL_PROJECT_ID=1
# TESTRAIL_RUN_ID=  # Optional, creates new if empty

# ===== JIRA DIRECT (DISABLED) =====
# JIRA_URL=https://company.atlassian.net
# JIRA_USER=user@company.com
# JIRA_API_TOKEN=your_api_token_here
#
# For Custom Field:
# JIRA_TEST_STATUS_FIELD=customfield_10100
#
# For Transitions:
# JIRA_TRANSITION_PASS=31
# JIRA_TRANSITION_FAIL=41

# ===== CI/CD =====
BUILD_ID=${CI_BUILD_ID}  # CI/CD variable
```

#### Changing TMS

To switch from Xray to another TMS:

1. **Comment the active line**:

```python
# _sync_to_xray_cloud(results)  # Comment Xray
```

2. **Uncomment the TMS you need**:

```python
_sync_to_testrail(results)  # Activate TestRail
```

3. **Configure corresponding environment variables** in your `.env` file

4. **Done**: The framework now uses the new TMS

---

## 6. Implementation Conventions

### 6.1 ATC Names

**Pattern:**

```
{verb}_{resource}_{scenario}_{condition}
```

**Examples:**

- `create_user_successfully`
- `delete_loan_with_invalid_id`
- `login_with_expired_credentials`
- `refund_payment_partially`

**Rules:**

- Always in English (or Spanish, depending on team convention)
- Verbs in infinitive
- Be descriptive but concise
- Indicate if positive scenario (`successfully`) or negative (`with_invalid_X`)

### 6.2 Component Names

**API Components:**

- Plural: `UsersApi`, `LoansApi`, `PaymentsApi`
- Suffix `Api`

**UI Components:**

- Singular or descriptive: `LoginPage`, `CheckoutPage`, `DashboardPage`
- Suffix `Page` for complete pages
- No suffix for widgets/partial components: `HeaderNav`, `SidebarMenu`

### 6.3 File Naming Guide

| Purpose              | File               | Class         |
| -------------------- | ------------------ | ------------- |
| Shared plumbing      | `testcontext.py`   | `TestContext` |
| Generic REST helpers | `api/api_base.py`  | `ApiBase`     |
| API fixture          | `api_fixture.py`   | `ApiFixture`  |
| Generic UI helpers   | `ui/ui_base.py`    | `UiBase`      |
| UI fixture           | `ui_fixture.py`    | `UiFixture`   |
| Unified fixture      | `test_fixture.py`  | `TestFixture` |
| API Component        | `api/users_api.py` | `UsersApi`    |
| UI Component         | `ui/login_page.py` | `LoginPage`   |

### 6.3 ATC Structure

All ATCs should follow the **Arrange-Act-Assert** pattern:

```python
@atc(test_id="RESOURCE-XXX")
def action_name(self, params):
    """
    Descriptive docstring.

    Args:
        param: description

    Returns:
        type: description

    Fixed Validations:
        - Validation 1
        - Validation 2
    """
    # ARRANGE: Prepare data and initial state
    payload = {...}
    initial_state = self.get_current_state()

    # ACT: Execute the main action
    response = self._post("/endpoint", json=payload)

    # ASSERT: Fixed assertions (mandatory validations)
    assert response.status_code == 201
    assert "id" in response.json()

    # Logging
    self.logger.info(f"✅ Action completed successfully")

    # Return result for chaining
    return response.json()
```

### 6.4 What to Return from an ATC

**General rule:** Return what the next action might need.

- If you create a resource → return the complete object
- If you get a resource → return the complete object
- If you modify a resource → return the updated object
- If you delete a resource → return True or status

**Example:**

```python
@atc(test_id="USER-001")
def create_user_successfully(self, name, email, password):
    # ... logic ...
    return user  # Complete object for next action

@atc(test_id="AUTH-001")
def login_successfully(self, email, password):
    # ... logic ...
    return auth_token  # Token to authenticate following requests
```

### 6.5 ATC Parameterization

ATCs can be parameterizable to cover multiple scenarios with a single method:

```python
@atc(test_id="FLIGHT-001")
def select_flight_dates(
    self,
    departure_date: Optional[str] = None,
    arrival_date: Optional[str] = None
):
    """
    ATC: Select flight dates.

    Args:
        departure_date: Departure date (optional)
        arrival_date: Arrival date (optional)

    Allows simulating:
        - Only departure date
        - Only arrival date
        - Both dates
        - No dates (error validation)
    """
    if departure_date:
        self.page.fill("#departure", departure_date)

    if arrival_date:
        self.page.fill("#arrival", arrival_date)

    # Fixed assertions based on parameters
    if departure_date:
        assert self.page.input_value("#departure") == departure_date
```

---

## 7. Best Practices

### 7.1 When to Use Fixed Assertions vs Test-Level Assertions

**Use Fixed Assertions for:**

- Validating that the action worked correctly (status code, valid response)
- Verifying direct effects of the action (resource created, state changed)
- Ensuring business preconditions (required fields present)

**Use Test-Level Assertions for:**

- Validating results that depend on combining multiple actions
- Verifying final system state after a complete flow
- Checking relationships between data from different actions

### 7.2 When to Use Soft Fail

**Use soft_fail=True when:**

- Validating optional fields in long forms
- Running exploratory tests where you want to see all failures
- Implementing non-critical validations that shouldn't stop the flow
- Generating screenshots from multiple pages even if one fails

**Do NOT use soft_fail when:**

- Failure implies following actions don't make sense
- You're validating critical functionality
- In production or critical staging environments

### 7.3 Component Organization

**A component should:**

- Group conceptually related ATCs
- Not have more than 15-20 ATCs (if it grows, split)
- Have a clear purpose reflected in its name
- Be independent of other components

**Signs you need to split a component:**

- The file has more than 500 lines
- Mixes unrelated responsibilities
- It's hard to find a specific ATC
- The component name doesn't clearly describe its content

### 7.4 API vs UI Separation

**Principle:** API and UI remain **totally isolated**.

**Why:**

- Integration tests (API) run without browser (faster)
- E2E tests can combine both strategically
- Precise autocomplete: `api.` shows endpoints, `ui.` shows pages
- Scalability: adding mobile doesn't affect API or web UI

**In E2E tests:**

- Use API for fast setup (create test data)
- Use UI for the journey you want to validate
- Use API for precise verifications (final state)

```python
def test_purchase_journey(api, ui):
    # Setup via API (fast)
    user = api.users.create_user_successfully(...)
    product = api.products.create_product_successfully(...)

    # Journey via UI (what we want to validate)
    ui.login.login_successfully(user["email"], password)
    ui.shop.add_to_cart(product["id"])
    order = ui.checkout.complete_purchase()

    # Verification via API (reliable)
    order_data = api.orders.get_order_successfully(order["id"])
    assert order_data["status"] == "completed"
```

### 7.5 Logging and Debugging

```python
@atc(test_id="LOAN-001")
def create_loan_successfully(self, user_id, amount):
    self.logger.info(f"🚀 Creating loan: user={user_id}, amount={amount}")

    response = self._post("/loans", json={...})

    if response.status_code != 201:
        self.logger.error(f"❌ Loan creation failed: {response.text}")

    assert response.status_code == 201

    loan = response.json()
    self.logger.info(f"✅ Loan created: id={loan['id']}")

    return loan
```

**Emoji convention:**

- 🚀 Action start
- ✅ Successful action
- ❌ Failure or error
- ⚠️ Warning or soft fail
- 📊 Report or statistic

---

## 8. Migration to KATA

If you have an existing suite and want to migrate to KATA:

### Phase 1: Identify ATC Candidates

- Review your current tests
- Identify code blocks that repeat
- Map those blocks to test cases in Jira/Xray
- Prioritize the most reused ones

### Phase 2: Create Component Structure

- Create KATA directory structure
- Implement TestContext with current configuration
- Create ApiBase or PageBase as needed

### Phase 3: Extract First Component

- Choose a functional area (e.g.: users)
- Create the component (UsersApi or LoginPage)
- Migrate methods as ATCs
- Add @atc decorators

### Phase 4: Implement Fixture

- Create ApiFixture or PageFixture
- Instantiate the first component
- Update a test to use the fixture

### Phase 5: Migrate Progressively

- Migrate one component at a time
- Keep old tests working in parallel
- Validate that new ATCs work the same
- Remove legacy code gradually

### Phase 6: Enable Traceability

- Implement @atc decorator
- Configure Test Management Tool integration
- Generate first report
- Validate automatic synchronization

---

## 9. Tools and Technologies

### Supported Languages

KATA is language-agnostic. Existing implementations:

- **Python** (pytest + requests + Playwright)
- **JavaScript/TypeScript** (Jest + axios + Playwright)
- **Java** (JUnit + RestAssured + Selenium)

### Testing Frameworks

- **Python**: pytest
- **JavaScript**: Jest, Mocha, Vitest
- **Java**: JUnit, TestNG

### HTTP Clients

- **Python**: requests, httpx
- **JavaScript**: axios, fetch
- **Java**: RestAssured, OkHttp

### UI Automation

- **Multi-language**: Playwright, Selenium
- **Python**: Playwright, Selenium
- **JavaScript**: Playwright, Puppeteer, Cypress

### Test Management Tools

- Jira + Xray
- Jira + Zephyr
- TestRail
- qTest
- PractiTest

### Reporting

- Allure
- ReportPortal
- Custom HTML Reports
- JSON Reports for integration

---

## 10. Real Use Cases

### Case 1: Loan System

```python
def test_loan_refund_flow(fixture):
    """
    Flow: Create loan → Make payment → Process refund
    Validate: Correct balance at each stage
    """
    # Create loan
    loan = fixture.api.loans.create_loan_successfully(
        user_id=123,
        amount=1000,
        term_months=12
    )
    assert loan["balance"] == 1000

    # Make payment
    payment = fixture.api.payments.process_payment_successfully(
        loan_id=loan["id"],
        amount=300
    )

    # Validate balance after payment
    loan = fixture.api.loans.get_loan_successfully(loan["id"])
    assert loan["balance"] == 700

    # Process refund
    refund = fixture.api.payments.refund_payment_successfully(
        payment_id=payment["id"],
        amount=100
    )

    # Validate final balance
    loan = fixture.api.loans.get_loan_successfully(loan["id"])
    assert loan["balance"] == 800
```

### Case 2: E-commerce Checkout

```python
def test_complete_purchase(fixture):
    """Complete purchase journey with successful payment."""
    # Setup via API
    user = fixture.api.users.create_user_successfully(
        name="John Doe",
        email="john@example.com"
    )

    # Login
    fixture.ui.login.login_successfully(user["email"], "password123")

    # Add products
    fixture.ui.catalog.search_product("Laptop")
    fixture.ui.catalog.add_to_cart_successfully("Laptop Pro 15")

    # Checkout
    fixture.ui.cart.proceed_to_checkout()
    fixture.ui.checkout.fill_shipping_info({
        "address": "123 Main St",
        "city": "New York",
        "zip": "10001"
    })

    order = fixture.ui.checkout.complete_purchase_successfully(
        payment_method="credit_card"
    )

    # Verification via API
    order_data = fixture.api.orders.get_order_successfully(order["id"])
    assert order_data["status"] == "completed"
    assert order_data["user_id"] == user["id"]
    assert len(order_data["items"]) == 1
```

### Case 3: Soft Fail in Long Form

```python
def test_multi_section_form(fixture):
    """Form with multiple optional sections."""
    fixture.ui.forms.navigate_to_application_form()

    # Mandatory section (without soft fail)
    fixture.ui.forms.fill_personal_info_successfully({
        "name": "Jane",
        "email": "jane@example.com"
    })

    # Optional section (with soft fail)
    fixture.ui.forms.fill_optional_employment_info(
        employer="Acme Corp",
        position="Engineer"
    )  # If it fails, continues

    # Another optional section (with soft fail)
    fixture.ui.forms.fill_optional_education_info(
        university="MIT",
        degree="Computer Science"
    )  # If it fails, continues

    # Final submit (should work even if optional sections failed)
    result = fixture.ui.forms.submit_application_successfully()
    assert result["status"] == "submitted"
```

---

## 11. Glossary

| Term                      | Definition                                                             |
| ------------------------- | ---------------------------------------------------------------------- |
| **ATC**                   | Acceptance Test Case - Automated acceptance test case                  |
| **Shared Action**         | An ATC implemented as a reusable method                                |
| **Component**             | Class that encapsulates related system functionality                   |
| **Fixture**               | Entry point that groups components via Dependency Injection            |
| **Fixed Assertions**      | Validations embedded in ATCs that always execute                       |
| **Test-Level Assertions** | Validations in the test that verify complete flow                      |
| **Soft Fail**             | Allow an ATC to fail without stopping test execution                   |
| **COM**                   | Component Object Model - Modular organization pattern                  |
| **DI**                    | Dependency Injection - Dependency injection pattern                    |
| **Base Component**        | Parent class with shared helpers (ApiBase, PageBase)                   |
| **Specific Component**    | Concrete class with ATCs (UsersApi, LoginPage)                         |
| **Test Context**          | Base layer with global configuration and utilities                     |
| **Traceability**          | 1:1 mapping between ATCs in code and test cases in TMS                 |

---

## 12. Additional Resources

### Example Repositories

- [KATA Python Template](https://github.com/example/kata-python) _(placeholder)_
- [KATA JavaScript Template](https://github.com/example/kata-js) _(placeholder)_

### Articles and Presentations

- "Introduction to KATA Architecture" _(pending)_
- "Migrating from Page Object Model to KATA" _(pending)_
- "Automated Traceability with KATA" _(pending)_

### Community

- Discord: [KATA Community](https://discord.gg/kata) _(placeholder)_
- GitHub Discussions: Share experiences and best practices

---

## 13. Conclusion

KATA Architecture is more than a design pattern: it's a complete philosophy for test automation that:

✅ **Structures your code** in clear layers with defined responsibilities
✅ **Reuses actions** through ATCs shared across multiple tests
✅ **Connects code with business** through 1:1 traceability with test cases
✅ **Scales with your project** thanks to Component Object Model and Dependency Injection
✅ **Granular visibility** of which functionalities passed or failed
✅ **Flexibility** to handle complex scenarios with soft-fail
✅ **Keeps your suite clean** by avoiding duplication and promoting composition

Like a kata in martial arts, KATA Architecture invites you to practice good habits repeatedly until building maintainable and traceable tests becomes natural.

---

**Author**: Elyer Maldonado
**Version**: 1.0
**Date**: October 2025
**License**: MIT

---

_"Well-structured code is like a perfect kata: every movement has purpose, and constant practice leads to mastery."_
