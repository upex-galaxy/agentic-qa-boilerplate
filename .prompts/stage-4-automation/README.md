# Stage 4: Test Automation

> **Purpose**: Implement automated tests for documented test cases using the KATA framework.
> **When to use**: After tests are documented in Jira/Xray and marked as "automation-candidate".

## Overview

Test Automation is the implementation phase where validated test cases become automated tests following the KATA (Komponent Action Test Architecture) framework.

**IMPORTANT:** This stage comes AFTER:

- Stage 2: Exploratory Testing (feature validated)
- Stage 3: Test Documentation (tests documented in Jira/Xray)

Only automate functionality that has been validated manually and documented.

## Prerequisites

- Tests documented in Jira/Xray (Stage 3 completed)
- Tests marked as "automation-candidate"
- KATA framework configured (or use kata-framework-setup.md)

## CRITICAL: Read Guidelines First

**Before ANY automation work, read:**

```
.context/guidelines/TAE/
├── KATA-AI-GUIDE.md          # Quick orientation
├── automation-standards.md    # Rules and patterns
└── kata-architecture.md       # Layer structure
```

## Prompts in This Stage

| Prompt                           | Purpose                                 |
| -------------------------------- | --------------------------------------- |
| `../kata-framework-setup.md`     | Initial setup or refactoring (one-time) |
| `automation-e2e-test.md`         | Implement E2E (UI) test automation      |
| `automation-integration-test.md` | Implement API test automation           |

## Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TEST AUTOMATION WORKFLOW                                  │
└─────────────────────────────────────────────────────────────────────────────┘

         ┌─────────────────────────────────────────┐
         │  Test marked "automation-candidate"     │
         │  (from Stage 3)                         │
         └────────────────┬────────────────────────┘
                          │
                          ▼
         ┌─────────────────────────────────────────┐
         │  Framework exists?                      │
         │     NO  → utilities/kata-framework-     │
         │           setup.md                      │
         │     YES → Continue                      │
         └────────────────┬────────────────────────┘
                          │
                          ▼
         ┌─────────────────────────────────────────┐
         │  What type of test?                     │
         │     E2E (UI) → automation-e2e-test.md   │
         │     API → automation-integration-       │
         │           test.md                       │
         └────────────────┬────────────────────────┘
                          │
                          ▼
         ┌─────────────────────────────────────────┐
         │  Implement ATC following KATA standards │
         │     - Create/update component           │
         │     - Register in fixture               │
         │     - Create test file                  │
         └────────────────┬────────────────────────┘
                          │
                          ▼
         ┌─────────────────────────────────────────┐
         │  Run and validate                       │
         └────────────────┬────────────────────────┘
                          │
                          ▼
         ┌─────────────────────────────────────────┐
         │  Update Xray: Test Status = "Automated" │
         └─────────────────────────────────────────┘
```

## KATA Architecture Overview

```
Layer 4: Fixtures (TestFixture, ApiFixture, UiFixture)
    └── Dependency injection, test extension
        ↓
Layer 3: Components (AuthApi, LoginPage)
    └── ATCs with @atc decorator
        ↓
Layer 2: Base Classes (ApiBase, UiBase)
    └── HTTP helpers, Playwright helpers
        ↓
Layer 1: TestContext
    └── Configuration, data generation
```

## Key KATA Principles

| Principle                  | Description                                     |
| -------------------------- | ----------------------------------------------- |
| **Unique Output**          | Each ATC represents ONE unique expected outcome |
| **Inline Locators**        | Locators defined IN the ATC, not separately     |
| **No Unnecessary Helpers** | Don't wrap single Playwright actions            |
| **Fixed Assertions**       | Assertions inside ATCs validate success         |
| **Import Aliases**         | Always use `@components/`, `@utils/`, etc.      |

## Test Types

### E2E Tests (UI)

- Location: `tests/e2e/{feature}/`
- Fixture: `{ kata }` or `{ ui }`
- Uses UI components (e.g., `LoginPage`)

### Integration Tests (API)

- Location: `tests/integration/{resource}/`
- Fixture: `{ api }`
- Uses API components (e.g., `AuthApi`)

## Output

- ATCs implemented following KATA standards
- Test files in appropriate directories
- Components registered in fixtures
- Tests passing in CI/CD pipeline
- Xray tests marked as "Automated"

---

**Related**: [Stage 3 - Documentation](../stage-3-documentation/) | [Stage 5 - Shift-Right](../stage-5-shift-right/)
