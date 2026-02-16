# Stage 4: Test Automation

> **Purpose**: Implement automated tests for documented test cases using the KATA framework.
> **When to use**: After tests are documented in the TMS and marked as "automation-candidate".

---

## Overview

Test Automation is the implementation phase where validated test cases become automated tests following the KATA (Komponent Action Test Architecture) framework.

**IMPORTANT:** This stage comes AFTER:

- Stage 2: Exploratory Testing (feature validated)
- Stage 3: Test Documentation (tests documented in TMS)

Only automate functionality that has been validated manually and documented.

---

## Three-Phase Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STAGE 4: AUTOMATION WORKFLOW                             │
└─────────────────────────────────────────────────────────────────────────────┘

Stage 3 Output (Gherkin + Variables + Test IDs)
                    │
                    ▼
    ┌───────────────────────────────────┐
    │  PHASE 1: PLAN                    │
    │  ─────────────────────────        │
    │  • Analyze test case              │
    │  • Architecture decisions         │
    │  • Identify components needed     │
    │  • Define ATCs and assertions     │
    └───────────────┬───────────────────┘
                    │
                    ▼
    ┌───────────────────────────────────┐
    │  PHASE 2: CODING                  │
    │  ─────────────────────────        │
    │  • Implement KATA component       │
    │  • Create test file               │
    │  • Register in fixture            │
    │  • Run and validate               │
    └───────────────┬───────────────────┘
                    │
                    ▼
    ┌───────────────────────────────────┐
    │  PHASE 3: REVIEW                  │
    │  ─────────────────────────        │
    │  • KATA compliance check          │
    │  • Code quality validation        │
    │  • Test quality assessment        │
    │  • Issue report (if any)          │
    └───────────────┬───────────────────┘
                    │
                    ▼
    ┌───────────────────────────────────┐
    │  TMS Update: Status = "Automated" │
    └───────────────────────────────────┘
```

---

## Prompts by Test Type

### E2E Tests (UI + API)

| Phase | Prompt | Purpose |
|-------|--------|---------|
| Plan | `e2e-test-automation-plan.md` | Analyze test case, plan KATA implementation |
| Coding | `e2e-test-automation-coding.md` | Implement UI component and test file |
| Review | `e2e-test-code-review.md` | Validate KATA compliance and code quality |

### Integration Tests (API Only)

| Phase | Prompt | Purpose |
|-------|--------|---------|
| Plan | `integration-test-automation-plan.md` | Analyze API test case, plan implementation |
| Coding | `integration-test-automation-coding.md` | Implement API component and test file |
| Review | `integration-test-code-review.md` | Validate KATA compliance and code quality |

---

## Prerequisites

Before using these prompts:

1. **Tests documented in TMS** (Stage 3 completed)
2. **Tests marked as "automation-candidate"**
3. **KATA framework configured** (see `.prompts/setup/kata-framework-adaptation.md`)

### Context Files Required

```
.context/guidelines/TAE/
├── kata-ai-index.md          # Quick orientation (ALWAYS read first)
├── automation-standards.md    # Rules and patterns
├── kata-architecture.md       # Layer structure
├── typescript-patterns.md     # TypeScript conventions
├── e2e-testing-patterns.md    # E2E specific patterns
└── api-testing-patterns.md    # API specific patterns

.context/
├── playwright-automation-system.md  # Code architecture overview
└── test-management-system.md        # TMS configuration
```

---

## Input from Stage 3

Each prompt expects documented test cases with:

| Element | Description | Example |
|---------|-------------|---------|
| **Gherkin Scenario** | Test steps in Given/When/Then format | `Scenario Outline: Validate login...` |
| **Variables Table** | Test data with how to obtain | `{user_id}` → SQL query |
| **Implementation Code** | Files being tested | `src/app/login/page.tsx` |
| **Test IDs** | Available data-testid attributes | `data-testid="submit-btn"` |
| **ROI Score** | Automation priority | `4.5 → AUTOMATE` |
| **Architecture** | Data fetching pattern | SSR / API / Client-side |

---

## KATA Architecture Quick Reference

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ LAYER 4: FIXTURES (Entry Points)                                            │
│ TestFixture.ts, ApiFixture.ts, UiFixture.ts                                │
│ └── Dependency injection, test extension                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ LAYER 3: DOMAIN COMPONENTS (ATCs)                                           │
│ AuthApi.ts, LoginPage.ts, BookingsApi.ts                                   │
│ └── @atc decorator, fixed assertions                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ LAYER 2: BASE COMPONENTS (Helpers)                                          │
│ ApiBase.ts, UiBase.ts                                                       │
│ └── HTTP helpers, Playwright helpers                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ LAYER 1: TEST CONTEXT (Foundation)                                          │
│ TestContext.ts                                                              │
│ └── Configuration, data generation (Faker)                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Key KATA Principles

| Principle | Description |
|-----------|-------------|
| **ATC = Complete Test Case** | Each ATC is a mini-flow, NOT a single click |
| **Equivalence Partitioning** | Same output = One parameterized ATC |
| **Inline Locators** | Locators defined IN the ATC, not separately |
| **ATCs Don't Call ATCs** | Use Flows module for reusable sequences |
| **Fixed Assertions** | Assertions inside ATCs validate success |
| **No Hardcoded Waits** | Use conditions: `waitForSelector`, `waitForResponse` |
| **Import Aliases** | Always use `@components/`, `@utils/`, etc. |

---

## Test Directory Structure

```
tests/
├── components/
│   ├── TestContext.ts        # Layer 1
│   ├── TestFixture.ts        # Layer 4 (unified)
│   ├── ApiFixture.ts         # Layer 4 (API)
│   ├── UiFixture.ts          # Layer 4 (UI)
│   ├── api/
│   │   ├── ApiBase.ts        # Layer 2
│   │   └── {Resource}Api.ts  # Layer 3 (your components)
│   ├── ui/
│   │   ├── UiBase.ts         # Layer 2
│   │   └── {Page}Page.ts     # Layer 3 (your components)
│   └── flows/
│       └── {Domain}Flows.ts  # Layer 3.5 (reusable chains)
├── e2e/
│   └── {feature}/
│       └── {feature}.test.ts # E2E tests
├── integration/
│   └── {resource}/
│       └── {resource}.test.ts # API tests
└── data/
    └── fixtures/              # Test data JSON
```

---

## Fixture Selection

| Test Type | Fixture | Browser Opens? | Use When |
|-----------|---------|----------------|----------|
| API only | `{ api }` | No (lazy) | Pure API testing |
| UI only | `{ ui }` | Yes | UI-focused testing |
| Hybrid | `{ test }` | Yes | API setup + UI verification |

```typescript
// API test - no browser overhead
test('create booking', async ({ api }) => {
  await api.bookings.createSuccessfully(data);
});

// E2E test - browser opens
test('view dashboard', async ({ ui }) => {
  await ui.dashboard.viewSuccessfully();
});

// Hybrid - shared context
test('create via API, verify via UI', async ({ test: fixture }) => {
  await fixture.api.bookings.createSuccessfully(data);
  await fixture.ui.bookings.verifyExists(data.id);
});
```

---

## Output

After completing all three phases:

- [ ] KATA component implemented (Layer 3)
- [ ] Test file created (e2e/ or integration/)
- [ ] Component registered in fixture
- [ ] Tests passing locally
- [ ] Code review completed (no critical issues)
- [ ] TMS test marked as "Automated"

---

## Related Stages

| Stage | Relationship |
|-------|--------------|
| **Stage 2: Exploratory** | Provides validated functionality |
| **Stage 3: Documentation** | Provides test cases (Gherkin + Variables) |
| **Stage 5: Shift-Right** | Tests run in CI/CD pipeline |

---

**Next**: Start with the appropriate Plan prompt based on test type.
