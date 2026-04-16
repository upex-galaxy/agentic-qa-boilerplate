# KATA Test Hierarchy

> **Purpose**: Defines how test concepts map between documentation and code across the KATA (Component Action Test Architecture).
> **Audience**: QA Engineers and AI agents at any stage — planning, documentation, or automation.
> **Rule**: Read this when confused about what a TC, ATC, TS, or Test Ticket actually is, and where each one lives.

---

## The 5-Level Hierarchy

The KATA architecture organizes tests in 5 levels, from broadest (module) to most granular (ATC):

```
Module (directory)         → tests/e2e/{module-name}/
  Feature (file .test.ts)  → {featureName}.test.ts
    Ticket (describe)      → test.describe('{PREFIX}-T01: Title')
      Scenario (test)      → test('{PREFIX}-T01: should ... when ...')
        ATC (@atc method)  → {verbResourceScenario}() ← in a Component
```

### Level-by-Level Definition

| Level | What It Is | Documentation | Code | Example |
|-------|-----------|---------------|------|---------|
| **Module** | Top-level grouping of related features | `PBI/{module}/` directory | `tests/e2e/{module}/` directory | `products`, `auth`, `orders` |
| **Feature** | A cohesive area of functionality within a module | Master test plan | 1 test file (`.test.ts`) | `openProductDetail.test.ts`, `user-session.test.ts` |
| **Ticket** | A tracking task that groups 3-7 related TCs | `test-specs/{PREFIX}-T01-{name}/spec.md` | `test.describe()` block | `UPEX-T01: Product Page States` |
| **Scenario** | A single test that executes one or more ATCs | TC or TS definition in spec.md | `test()` block | `should show out-of-stock state when inventory is 0` |
| **ATC** | Atomic action with assertions (implements a TC) | ATC spec in `atc/` directory | `@atc()` method in Component | `openProductDetailOutOfStock()` |

---

## Key Relationships

### TC and ATC: 1:1

A **TC** is the specification. An **ATC** is its implementation. They are the same thing viewed from two sides.

```
TC (documentation)     ═══ 1:1 ═══     ATC (code)
AUTH-001 in spec.md    ═══════════►     @atc('AUTH-001') authenticateSuccessfully()
```

- A TC is defined by **Precondition + Action** (see TC Identity Rule in `TAE/test-design-principles.md`)
- All expected results from the same precondition + action are **assertions within that TC/ATC**
- The `@atc('TICKET-ID')` decorator links code back to the TC specification

### Test Scenario (TS): NOT an ATC

A Test Scenario is a `test()` block that **chains multiple ATCs** into a flow. It does NOT have an `@atc` decorator — it's not a reusable component, it's an orchestration.

```typescript
// TS = test() block, chains multiple ATCs
test('UPEX-T01: should transition from out-of-stock to in-stock after restock', async ({ ui }) => {
  // Step 1: Verify out-of-stock state (calls ATC UPEX-001)
  await ui.products.openProductDetailOutOfStock(productId);

  // Step 2: Restock via API, then verify in-stock state (calls ATC UPEX-003)
  await ui.products.openProductDetailInStock(productId);
});
```

A TS exists when the test:
- Chains 2+ user actions with intermediate verifications
- Requires cross-page navigation
- Simulates errors or browser navigation

### Test Ticket: NOT a Test Artifact

A Test Ticket is a **project management unit** — a task in the backlog that says "automate these 3-5 TCs". It groups related TCs for tracking purposes.

```
Test Ticket scope:
- Sufficient for one PR
- Completable in 1-2 sessions
- Grouped by functional area, NOT by UI component
```

A ticket maps to a `test.describe()` block in code. Multiple tickets can live in the same `.test.ts` file if they belong to the same feature:

```typescript
// openProductDetail.test.ts  ← 1 file = 1 feature

test.describe('UPEX-T01: Product Page States', () => {
  test('UPEX-T01: should show out-of-stock state when inventory is 0', ...);
  test('UPEX-T01: should show full detail view when product is in stock', ...);
});

test.describe('UPEX-T02: Detail Refresh on Variant Change', () => {
  test('UPEX-T02: should refresh pricing and stock when variant changes', ...);
});
```

---

## Mapping Summary

### Documentation → Code

| Documentation Artifact | Code Artifact | Relationship |
|----------------------|---------------|--------------|
| Module (`PBI/{module}/`) | Directory (`tests/e2e/{module}/`) | 1:1 |
| Master test plan | — (consumed as context, not code) | Reference |
| Test ticket (`spec.md`) | `test.describe()` block | 1:1 |
| TC (Gherkin scenario) | `test()` block calling an ATC | 1:1 |
| TS (multi-action flow) | `test()` block calling multiple ATCs | 1:1 |
| ATC spec (`atc/*.md`) | `@atc()` method in Component | 1:1 |

### Code Structure Mapping

```
tests/e2e/{module}/                      ← Module
  {feature}.test.ts                      ← Feature (file)
    test.describe('{PREFIX}-T01: ...')    ← Ticket (describe)
      test('should ... when ...', ...)   ← Scenario (test)
        await component.atcMethod()      ← ATC call

tests/components/{api|ui}/               ← Components (Layer 3)
  {Module}Api.ts or {Module}Page.ts
    @atc('TC-XXX') async method()        ← ATC definition (TC-XXX = TMS-generated ID)
```

> **Canonical TC ID**: The `TC-XXX` inside `@atc()` is the ID the TMS (Jira/Xray) generates when the test case is created. Every ATC must exist in Jira/Xray BEFORE it is implemented in code — the TMS is the source of truth for TC IDs. Module prefixes like `AUTH-`, `ORD-` are used only for local folder/file organization in `test-specs/` directories (e.g., `AUTH-TC47-login-locked-account/`), they are NOT the canonical identifier.

---

## Common Confusions

| Confusion | Reality |
|-----------|---------|
| "Each TC should be a separate test file" | No. Multiple TCs (tickets) can be `describe()` blocks within the same `.test.ts` file |
| "A Test Scenario is a special category" | No. It's just a `test()` block that calls more than one ATC. The behavior of chaining ATCs is normal |
| "Tickets map to test files" | No. Tickets map to `test.describe()` blocks. Features map to test files |
| "ATCs and TCs are different things" | No. TC is the spec, ATC is the code. They are 1:1 |
| "A test with multiple assertions is a TS" | No. A TC can have N assertions. It becomes a TS only when it chains multiple **user actions** |

---

## See Also

- `QA/atc-definition-strategy.md` — How to define and name ATCs (Terminology section)
- `QA/test-spec-standards.md` — TC discovery scopes, New vs Update TC workflow
- `TAE/test-design-principles.md` — TC Identity Rule, assertion rules, equivalence partitioning
- `TAE/automation-standards.md` — Code templates for Components and test files
- `TAE/kata-architecture.md` — KATA layered architecture (TestContext → Base → Component → Fixture → Test)