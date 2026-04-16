# Test Spec Standards

> **Purpose**: How to discover, design, and document test cases — whether they come from a user story, a module investigation, a regression, or exploratory testing.
> **Audience**: QA Engineers and AI agents working on test documentation (Stage 3) and automation planning (Stage 5).
> **Rule**: Read this before creating or updating test cases. The TC Identity Rule is the foundation of correct test design.

---

## Quick Summary

1. **A TC is defined by Precondition + Action.** All expected results belong to the same TC — regardless of which panel, endpoint, or concern they validate.
2. **Start from actions, not assertions.** First identify what the user DOES, then list ALL expected outputs.
3. **New analysis can create NEW TCs or UPDATE existing ones.** If a new AC describes the same precondition + action as an existing TC, add assertions to the existing TC — don't create a duplicate.
4. **TCs are discovered through 4 scopes**: module-driven, ticket-driven, regression-driven, exploratory-driven.
5. **Test tickets are work tracking items** that group 3-7 TCs for implementation. They are not test boundaries.

---

## 1. TC Discovery Scopes

Test cases are discovered through different analysis contexts. Each scope has a different trigger, but they ALL follow the same TC design rules.

### The 4 Scopes

| Scope | Trigger | What You Discover | Typical Output |
|-------|---------|-------------------|----------------|
| **Module-driven** | Need comprehensive coverage of a feature area | All TCs for the module (batch) | N test tickets, each with 3-7 TCs |
| **Ticket-driven** | New user story arrives in the sprint | New TCs from ACs, or new assertions for existing TCs | 1 test ticket or updates to existing TCs |
| **Regression-driven** | Bug fix or production incident | 1-3 TCs to prevent recurrence | 1 test ticket or direct TC addition |
| **Exploratory-driven** | Gap found during manual testing | 1-2 TCs to cover the gap | Direct TC addition |

### How Each Scope Works

**Module-driven** (Macro):
```
Investigate module → Identify all user actions → Map precondition partitions
→ Define complete TC set → Group into test tickets → Phased roadmap
```
Uses: `module-test-specification.md` → produces test tickets consumed by `test-implementation-plan.md`

**Ticket-driven** (Medium):
```
Receive user story → Analyze ACs → For each AC:
  → Does a TC with this precondition + action already exist?
    YES → Add new assertions to existing TC
    NO  → Create new TC with all expected results
```
Uses: `test-implementation-plan.md` directly

**Regression-driven** (Micro):
```
Bug fixed → Identify the scenario that failed → Define TC to prevent recurrence
→ Check if scenario maps to existing TC precondition + action
  YES → Add regression assertion to existing TC
  NO  → Create new TC
```
Uses: `atc-implementation-plan.md`

**Exploratory-driven** (Micro):
```
Testing session reveals untested behavior → Define the scenario
→ Check if it maps to existing TC precondition + action
  YES → Add assertions to existing TC
  NO  → Create new TC
```
Uses: `atc-implementation-plan.md`

### Key Insight: Every Scope Can Update Existing TCs

No matter how you discover a testing need, the first question is always:

> **"Does a TC with this precondition + action already exist?"**

If yes → update it (add assertions). If no → create it.

---

## 2. The TC Identity Rule

> **Source of truth**: `TAE/test-design-principles.md` (Section 1: TC Identity Rule)

A Test Case is identified by exactly two elements:

```
TC = Precondition + Action
     └─── All expected results are assertions of THIS TC
```

### The Rule

**If two test cases share the same precondition and the same action, they are the SAME test case.** Their expected results must be combined into a single TC with multiple assertions.

This applies regardless of:
- Which UI panel or section the assertion validates
- Which API endpoint the assertion checks
- Which ticket or user story the assertion originated from
- Which "concern" (visual, data, behavior) the assertion addresses
- Which sprint the assertion was discovered in

### New TC vs Update Existing TC

When analyzing a user story, a bug, or a module:

```
For each Acceptance Criterion or discovered behavior:
  1. Identify the PRECONDITION (system state)
  2. Identify the ACTION (what the user does)
  3. Search existing TCs for this Precondition + Action combination
     ├── FOUND → Add new assertions to the existing TC
     └── NOT FOUND → Create a new TC with all expected results
```

#### Example: User Story Adds to Existing TC

```
Existing TC (from Sprint 5):
  UPEX-103: Validate product detail view when product is published
  Precondition: Product exists and is published
  Action: Open the product detail page
  Expected Output:
    - "Product Details" heading visible
    - "Add to Cart" button visible
    - "Out of Stock" banner NOT visible

New User Story (Sprint 7): "US-450: Show pricing breakdown on product page"
  AC: When viewing a published product, the price block should display
      Base price, Discount, and Final price.

Analysis:
  Precondition → Published product (SAME as UPEX-103)
  Action → Open product detail page (SAME as UPEX-103)
  → This is NOT a new TC. Add assertions to UPEX-103:

Updated UPEX-103:
  Expected Output:
    - "Product Details" heading visible
    - "Add to Cart" button visible
    - "Out of Stock" banner NOT visible
    - Base price displayed                       ← NEW from US-450
    - Discount amount displayed                   ← NEW from US-450
    - Final price displayed                       ← NEW from US-450
    - Final price equals Base - Discount          ← NEW from US-450
```

#### Example: Bug Fix Adds to Existing TC

```
Bug: "Stock counter shows NaN when product has 0 units in inventory"
  Precondition → Product with 0 units in stock
  Action → Open product detail page

Existing TC:
  UPEX-123: Validate product detail view when product is out of stock
  Expected Output:
    - Stock counter shows "0"
    - "Add to Cart" button is disabled

This bug reveals the TC was already correct but the code wasn't.
No TC change needed — just fix the code and ensure UPEX-123 catches it.

BUT if UPEX-123 didn't exist:
  → Create it as a new TC (different precondition from UPEX-103)
```

---

## 3. How to Design TCs (The Correct Workflow)

### Step 1: Identify User Actions

Start by listing what the user **DOES** in the module. Not what you want to check — what the user performs.

```
Module: Product Catalog
User Actions:
  A1: Open a product detail page (the primary action)
  A2: Click "Add to Cart" button
  A3: Click "Apply Discount Code" button
  A4: Navigate to Category page from Product detail
  A5: Click "Checkout" button
```

### Step 2: Identify Precondition Partitions

For each action, identify the **different system states** (preconditions) that produce different behaviors:

```
A1: Open product detail page
  Preconditions:
    P1: Product does NOT exist (404)                       → not found state
    P2: Product exists but is unpublished                  → restricted state
    P3: Product is published and in stock                  → detail page with buy actions
    P4: Product is published and has an active discount    → detail page with discount badge
    P5: Product is published but out of stock              → detail page with disabled CTA
    P6: Product is published with 0 reviews                → detail page with empty reviews block
```

Each unique `P + A` combination is a TC candidate.

### Step 3: Check for Existing TCs

Before creating a new TC, check if a TC with this precondition + action already exists:

```
P3 + A1 → Exists as UPEX-103? → YES → Add assertions to UPEX-103
P4 + A1 → Exists? → NO → Create new TC in Jira (e.g., UPEX-114)
```

### Step 4: List ALL Expected Results Per TC

For each TC (new or updated), list **every single thing** you expect after the action — across ALL panels, sections, and data points:

```
TC: Open product detail page (P3 + A1)
  Expected Output:
    Structure:
      - "Product Details" heading visible
      - "Add to Cart" button visible
      - Image gallery visible
      - Reviews section visible
      - "Out of Stock" and "Unavailable" banners NOT visible
    Pricing Block:
      - Base price displayed
      - Discount amount displayed (0 when no discount)
      - Final price displayed
      - Final price equals Base - Discount
    Inventory Block:
      - Stock counter shows > 0
      - Delivery estimate visible
    Reviews Block:
      - Average rating displayed
      - Review count displayed
      - At least 1 review card visible when count > 0
```

**All of these are assertions of ONE TC** because they share the same precondition and action.

### Step 5: Group Into Test Tickets

NOW — after defining TCs correctly — group them into test tickets by functional area for tracking:

```
UPEX-T01: Product Page States
  → UPEX-101 (P1+A1): not found state
  → UPEX-102 (P2+A1): restricted/unpublished state
  → UPEX-103 (P3+A1): published in-stock (ALL assertions: structure + pricing + inventory + reviews)
  → UPEX-104 (TS):    transition between states when stock drops to 0

UPEX-T03: Discount-Specific Scenarios
  → UPEX-113 (P3a+A1): base price (no active discount)
  → UPEX-114 (P4+A1):  active percentage discount applied
  → UPEX-115 (P4b+A1): active fixed-amount discount applied
  → UPEX-116 (P4c+A1): expired discount no longer applied
```

Notice: UPEX-103 includes ALL product detail assertions (structure, pricing, inventory, reviews). UPEX-T03 only contains TCs with **genuinely different preconditions** (discount states).

> `UPEX-T01` / `UPEX-T03` are **ticket** IDs (work-tracking containers). `UPEX-101`, `UPEX-114` are **Test Case** IDs generated by Jira/Xray — they are the canonical identifiers used in `@atc()` decorators.

---

## 4. What is a Test Ticket?

A **test ticket** is the testing equivalent of a user story — a functional piece of work that groups related test cases for tracking and implementation.

```
Test Ticket: "UPEX-T01: Product Page States"
├── TC: UPEX-101 - Open product detail page when product does not exist
├── TC: UPEX-102 - Open product detail page when product is unpublished
├── TC: UPEX-103 - Open product detail page when product is published and in stock
└── TS: UPEX-104 - Transition from in-stock to out-of-stock when last unit is sold
```

### What a Test Ticket IS

- A **work tracking unit** — like any user story in your sprint board
- A **container** for 3-7 related TCs that will be automated together
- A **scope boundary** for a single PR or implementation session
- Grouped by **functional area** (e.g., "Invoice Cap Application", not "Left Panel")

### What a Test Ticket is NOT

- NOT a test case itself
- NOT a reason to split TCs — the ticket boundary should never dictate TC boundaries
- NOT a scope that limits which assertions a TC can have

### Test Ticket vs Test Case

| Aspect | Test Ticket | Test Case (TC) |
|--------|------------|----------------|
| **Analogy** | User Story (functional piece of work) | Acceptance Criterion (testable behavior) |
| **Identity** | Grouping by functional area | Defined by Precondition + Action |
| **Granularity** | Contains 3-7 TCs | Contains 1+ assertions |
| **Splitting rule** | Split by functional area or priority | Split ONLY when precondition or action changes |
| **Can be updated** | New TCs added when discovered | New assertions added from new ACs or bugs |
| **Lifespan** | Closed when TCs are automated | Lives forever in the TMS and code |

---

## 5. Common Mistakes and How to Prevent Them

### Mistake 1: Creating a New TC When You Should Update an Existing One

```
Sprint 5: TC-A exists: "Open product detail page for in-stock product → verify detail view"
Sprint 7: New US says "show pricing breakdown on product detail page"

WRONG:
  Create TC-B: "Open product detail page for in-stock product → verify pricing values"
  (Same precondition + action as TC-A!)

CORRECT:
  Update TC-A: Add pricing value assertions to TC-A's expected output
```

**Prevention**: Before creating any TC, search existing TCs for the same precondition + action.

### Mistake 2: Splitting by UI Concern

```
WRONG:
  TC-A: Open in-stock product → verify Pricing block renders
  TC-B: Open in-stock product → verify Reviews block renders

CORRECT:
  TC-A: Open in-stock product → verify ALL blocks, metrics, and structure
```

**Prevention**: Ask "Is there another TC with the same precondition and action?" If yes, merge.

### Mistake 3: Creating TCs from Assertions

```
WRONG workflow:
  "I need to check final price" → TC-1
  "I need to check review count" → TC-2

CORRECT workflow:
  "What action produces these outputs?" → Open product detail page
  "What precondition?" → Product is published and in stock
  → ONE TC with all assertions
```

**Prevention**: Always start from **actions**, never from assertions.

### Mistake 4: Letting Ticket Boundaries Define TC Boundaries

```
WRONG:
  Ticket "Pricing Block Tests" → TC checks only pricing
  Ticket "Reviews Block Tests" → TC checks only reviews
  (But both TCs have same precondition + action!)

CORRECT:
  Ticket "Product Page States" → TC checks ALL blocks for each state
  Ticket "Discount Scenarios" → TC checks discount-specific behaviors (different preconditions)
```

**Prevention**: Define TCs first, group into tickets second. Never the reverse.

---

## 6. TC Documentation Format

When documenting a TC in a test ticket, use this structure:

```markdown
### {ID}: Validate {CORE} when {CONDITIONAL}

**Precondition**: {System state required — the equivalent partition}
**Action**: {What the user DOES — the trigger}
**Expected Output**:
  - {Assertion 1: what should be visible/correct}
  - {Assertion 2: what should be visible/correct}
  - {Assertion 3: what should NOT be visible}
  - ...list ALL assertions, not just the primary ones

Gherkin:
  Scenario: {ID} - Validate {CORE} when {CONDITIONAL}
    Given {precondition}
    When the user {action}
    Then {assertion 1}
    And {assertion 2}
    And {assertion 3}
```

> **Note:** `{ID}` is the canonical TC ID generated by the TMS (e.g., `UPEX-47` from Jira/Xray). See the "ID Management (Jira/Xray as Source of Truth)" section below for how TMS IDs flow into code.

### ID Management (Jira/Xray as Source of Truth)

The canonical identifier for every TC is the ID generated by the TMS (Jira issue key or Xray test key — e.g., `UPEX-47`). This ID is what appears in:

- The `@atc('UPEX-47')` decorator in code
- The `test()` function name: `test('UPEX-47: should ... when ...')`
- The spec.md heading: `### UPEX-47: Validate {CORE} when {CONDITIONAL}`

**Module prefixes** (e.g., `MS-`, `ORD-`) are used ONLY for local folder/file organization within `test-specs/` directories — they provide module context but are NOT the canonical ID. Example folder name: `MS-UPEX47-select-item-no-data/`.

**Workflow rule:** Every ATC must exist in Jira/Xray BEFORE it is implemented in code. The TC issue must be created first; the generated issue key is then used in the `@atc` decorator.

### Rules for Expected Output

- List **every** assertion, even if it seems obvious
- Group assertions by area (Structure, Data, Behavior) for readability, but they ALL belong to the same TC
- Include negative assertions ("X should NOT be visible")
- Include data validations ("total equals sum of line items")
- If you can't list all assertions yet, mark with `[TODO: discover during implementation]`

---

## 7. Validation Checklist

Before finalizing test specs, verify:

- [ ] Every TC has a unique Precondition + Action combination
- [ ] No two TCs across ANY ticket share the same Precondition + Action
- [ ] Before creating a new TC, checked that no existing TC has the same Precondition + Action
- [ ] Each TC lists ALL expected outputs (not just the ones related to the ticket's theme)
- [ ] TCs were designed from **actions first**, not from assertions
- [ ] Multi-step flows are flagged as Test Scenarios (TS), not TCs
- [ ] Test tickets contain 3-7 TCs each (split or merge if outside range)
- [ ] Ticket grouping is by functional area, not by UI panel or API endpoint

---

## References

- **TC Identity Rule (source of truth)**: `docs/guidelines/TAE/test-design-principles.md` (Section 1)
- **ATC Definition Strategy**: `docs/guidelines/QA/atc-definition-strategy.md`
- **Planning Scopes**: `.prompts/stage-5-automation/README.md` (Section: Planning Scope)
- **Module Test Specification** (macro planning): `.prompts/stage-5-automation/planning/module-test-specification.md`
- **Test Implementation Plan** (per ticket): `.prompts/stage-5-automation/planning/test-implementation-plan.md`