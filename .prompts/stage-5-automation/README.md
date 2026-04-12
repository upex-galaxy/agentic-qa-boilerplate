# Stage 5: Test Automation

> **Purpose**: Implement automated tests for documented test cases using the KATA architecture.
> **When to use**: After tests are documented in the TMS and marked as "automation-candidate".

---

## Overview

Test Automation is the implementation phase where validated test cases become automated tests following the KATA (Component Action Test Architecture).

**IMPORTANT:** This stage comes AFTER:

- Stage 2: Test Execution (feature validated)
- Stage 4: Test Documentation (tests documented in TMS)

Only automate functionality that has been validated manually and documented.

---

## Three-Phase Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STAGE 5: AUTOMATION WORKFLOW                             │
└─────────────────────────────────────────────────────────────────────────────┘

Stage 4 Output (Gherkin + Variables + Test IDs)
                    │
                    ▼
    ┌───────────────────────────────────┐
    │  PHASE 1: PLANNING               │
    │  ─────────────────────────        │
    │  • Analyze test case / ticket     │
    │  • Architecture decisions         │
    │  • Identify components needed     │
    │  • Define ATCs and assertions     │
    │  • ATC spec (if needed)           │
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

## Directory Structure

```
stage-5-automation/
├── README.md                                  # This file
├── planning/
│   ├── test-implementation-plan.md            # Unified (E2E + Integration)
│   └── atc-implementation-plan.md             # ATC spec (API + UI)
├── coding/
│   ├── e2e-test-coding.md                     # UI components + locators
│   └── integration-test-coding.md             # API components + tuples
└── review/
    ├── e2e-test-review.md                     # E2E code review checklist
    └── integration-test-review.md             # Integration code review checklist
```

---

## Prompts by Phase

### Phase 1: Planning

| Prompt | Scope | Purpose |
|--------|-------|---------|
| `planning/test-implementation-plan.md` | E2E + Integration | Full implementation plan for a test ticket (scenarios, ATCs, data strategy, file map) |
| `planning/atc-implementation-plan.md` | API + UI | Detailed spec for a single ATC (contract, assertions, code template) |

### Phase 2: Coding

| Prompt | Test Type | Purpose |
|--------|-----------|---------|
| `coding/e2e-test-coding.md` | E2E | Implement UI component and test file |
| `coding/integration-test-coding.md` | Integration | Implement API component and test file |

### Phase 3: Review

| Prompt | Test Type | Purpose |
|--------|-----------|---------|
| `review/e2e-test-review.md` | E2E | Validate KATA compliance and code quality |
| `review/integration-test-review.md` | Integration | Validate KATA compliance and code quality |

---

## Prerequisites

Before using these prompts:

1. **Tests documented in TMS** (Stage 4 completed)
2. **Tests marked as "automation-candidate"**
3. **KATA architecture configured** (see `.prompts/setup/kata-architecture-adaptation.md`)

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

## Input from Stage 4

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
| **ATCs Don't Call ATCs** | Use Steps module for reusable sequences |
| **Fixed Assertions** | Assertions inside ATCs validate success |
| **No Hardcoded Waits** | Use conditions: `waitForSelector`, `waitForResponse` |
| **Import Aliases** | Always use `@components/`, `@utils/`, etc. |

---

## Ticket ID Convention

The `@atc('{TICKET-ID}')` decorator and `test('{TICKET-ID}: should...')` naming use the **real issue key from your Jira project**. The prefix depends on your project configuration:

| Project | ATC Example | Test Example |
|---------|-------------|--------------|
| UPEX | `@atc('UPEX-101')` | `test('UPEX-411: should...')` |
| MYM | `@atc('MYM-45')` | `test('MYM-200: should...')` |
| QA | `@atc('QA-33')` | `test('QA-100: should...')` |

See `.context/guidelines/TAE/test-design-principles.md` for the full traceability model.

---

## Fixture Selection

| Test Type | Fixture | Browser Opens? | Use When |
|-----------|---------|----------------|----------|
| API only | `{ api }` | No (lazy) | Pure API testing |
| UI only | `{ ui }` | Yes | UI-focused testing |
| Hybrid | `{ test }` | Yes | API setup + UI verification |

---

## TMS Workflow Status Transitions

Update the test case status in your TMS as you progress through each phase:

| Phase | Action | Status Transition |
|-------|--------|-------------------|
| **Before starting** | Pick up test case for implementation | `Candidate` → `In Automation` |
| **After Phase 2** | Code complete, PR created | `In Automation` → `In Review` |
| **After Phase 3** | Review passed, PR merged | `In Review` → `Automated` |
| **If blocked** | Missing data, unclear spec, environment issue | `In Automation` → `Candidate` (with note) |

**Full lifecycle reference:** `.prompts/README.md` → TC Workflow Status section

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
| **Stage 2: Execution** | Provides validated functionality |
| **Stage 4: Documentation** | Provides test cases (Gherkin + Variables) |
| **Stage 6: Regression** | Tests run in CI/CD pipeline |

---

**Next**: Start with `planning/test-implementation-plan.md` to plan your implementation.
