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
  MS-003: Select hotel/month with processed data
  Precondition: Hotel has fully processed booking data
  Action: Select hotel and month in filters
  Expected Output:
    - "Commission Invoice" heading visible
    - "Matched Bookings" heading visible
    - Awaiting/Processing messages NOT visible

New User Story (Sprint 7): "US-450: Show commission breakdown"
  AC: When viewing a hotel with processed data, the commission panel
      should display Standard, Boosted, and Platform Fee amounts

Analysis:
  Precondition → Hotel with processed data (SAME as MS-003)
  Action → Select hotel/month (SAME as MS-003)
  → This is NOT a new TC. Add assertions to MS-003:

Updated MS-003:
  Expected Output:
    - "Commission Invoice" heading visible
    - "Matched Bookings" heading visible
    - Awaiting/Processing messages NOT visible
    - Standard Bookings amount displayed          ← NEW from US-450
    - Boosted Bookings amount displayed            ← NEW from US-450
    - Platform Fee amount displayed                ← NEW from US-450
    - Total equals sum of Standard + Boosted + Fee ← NEW from US-450
```

#### Example: Bug Fix Adds to Existing TC

```
Bug: "ADR shows NaN when hotel has 0 bookings"
  Precondition → Hotel with 0 bookings for the month
  Action → Select hotel/month

Existing TC:
  MS-023: Select hotel/month with zero bookings
  Expected Output:
    - All three metric cards show 0
    - ADR shows "$0" or "N/A"

This bug reveals the TC was already correct but the code wasn't.
No TC change needed — just fix the code and ensure MS-023 catches it.

BUT if MS-023 didn't exist:
  → Create it as a new TC (different precondition from MS-003)
```

---

## 3. How to Design TCs (The Correct Workflow)

### Step 1: Identify User Actions

Start by listing what the user **DOES** in the module. Not what you want to check — what the user performs.

```
Module: Monthly Statement
User Actions:
  A1: Select hotel and month in filters (the primary action)
  A2: Click "Upload Booking File" button
  A3: Click Export button
  A4: Navigate to Bookings page from Monthly Statement
  A5: Click "Confirm Invoice" button
```

### Step 2: Identify Precondition Partitions

For each action, identify the **different system states** (preconditions) that produce different behaviors:

```
A1: Select hotel/month in filters
  Preconditions:
    P1: Hotel has NO booking file for that month          → awaiting state
    P2: Hotel has file uploaded but NOT processed          → processing state
    P3: Hotel has fully processed data                     → dashboard state
    P4: Hotel has processed data with finalized invoice    → dashboard with invoice number
    P5: Hotel has processed data with commission adjustment → dashboard with adjustment line
    P6: Hotel has processed data with 0 bookings           → dashboard with empty metrics
```

Each unique `P + A` combination is a TC candidate.

### Step 3: Check for Existing TCs

Before creating a new TC, check if a TC with this precondition + action already exists:

```
P3 + A1 → Exists as MS-003? → YES → Add assertions to MS-003
P4 + A1 → Exists? → NO → Create new TC: MS-014
```

### Step 4: List ALL Expected Results Per TC

For each TC (new or updated), list **every single thing** you expect after the action — across ALL panels, sections, and data points:

```
TC: Select hotel/month with fully processed data (P3 + A1)
  Expected Output:
    Structure:
      - "Commission Invoice" heading visible
      - "Matched Bookings" heading visible
      - Bookings chart visible
      - Reconciliation status bar visible
      - "Awaiting" and "Processing" messages NOT visible
    Commission Panel:
      - Standard Bookings amount displayed
      - Boosted Bookings amount displayed
      - Platform Fee amount displayed
      - Total equals sum of above
    Matched Bookings Panel:
      - Total Bookings card shows count, nights, revenue, ADR
      - Matched card shows count with percentage
      - Commissionable card shows count with percentage
      - Chart shows 3 bars with proportional lengths
    Status Bar:
      - Current reconciliation stage highlighted
```

**All of these are assertions of ONE TC** because they share the same precondition and action.

### Step 5: Group Into Test Tickets

NOW — after defining TCs correctly — group them into test tickets by functional area for tracking:

```
MS-T01: Page State Transitions
  → MS-001 (P1+A1): awaiting state
  → MS-002 (P2+A1): processing state
  → MS-003 (P3+A1): processed data (ALL assertions: structure + data + metrics)
  → MS-004 (TS): transition between states

MS-T03: Invoice-Specific Scenarios
  → MS-013 (P3a+A1): estimated invoice (no finalized invoice exists)
  → MS-014 (P4+A1): finalized invoice
  → MS-015 (P5+A1): commission adjustment visible
  → MS-016 (P5b+A1): no adjustment (original = adjusted)
```

Notice: MS-003 includes ALL dashboard assertions (structure, commission, bookings, chart). MS-T03 only contains TCs with **genuinely different preconditions** (invoice states).

---

## 4. What is a Test Ticket?

A **test ticket** is the testing equivalent of a user story — a functional piece of work that groups related test cases for tracking and implementation.

```
Test Ticket: "MS-T01: Page State Transitions"
├── TC: MS-001 - Select hotel/month with no booking data
├── TC: MS-002 - Select hotel/month with unprocessed data
├── TC: MS-003 - Select hotel/month with processed data
└── TS: MS-004 - Transition from awaiting to dashboard on month change
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
Sprint 5: TC-A exists: "Select hotel with processed data → verify dashboard"
Sprint 7: New US says "show commission breakdown for processed hotels"

WRONG:
  Create TC-B: "Select hotel with processed data → verify commission values"
  (Same precondition + action as TC-A!)

CORRECT:
  Update TC-A: Add commission value assertions to TC-A's expected output
```

**Prevention**: Before creating any TC, search existing TCs for the same precondition + action.

### Mistake 2: Splitting by UI Concern

```
WRONG:
  TC-A: Select processed hotel → verify Commission panel renders
  TC-B: Select processed hotel → verify Matched Bookings panel renders

CORRECT:
  TC-A: Select processed hotel → verify ALL panels, metrics, and structure
```

**Prevention**: Ask "Is there another TC with the same precondition and action?" If yes, merge.

### Mistake 3: Creating TCs from Assertions

```
WRONG workflow:
  "I need to check commission total" → TC-1
  "I need to check booking count" → TC-2

CORRECT workflow:
  "What action produces these outputs?" → Select hotel/month
  "What precondition?" → Hotel with processed data
  → ONE TC with all assertions
```

**Prevention**: Always start from **actions**, never from assertions.

### Mistake 4: Letting Ticket Boundaries Define TC Boundaries

```
WRONG:
  Ticket "Commission Panel Tests" → TC checks only commission
  Ticket "Bookings Panel Tests" → TC checks only bookings
  (But both TCs have same precondition + action!)

CORRECT:
  Ticket "Page State Transitions" → TC checks ALL panels for each state
  Ticket "Invoice Scenarios" → TC checks invoice-specific behaviors (different preconditions)
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

- **TC Identity Rule (source of truth)**: `.context/guidelines/TAE/test-design-principles.md` (Section 1)
- **ATC Definition Strategy**: `.context/guidelines/QA/atc-definition-strategy.md`
- **Planning Scopes**: `.prompts/stage-5-automation/README.md` (Section: Planning Scope)
- **Module Test Specification** (macro planning): `.prompts/stage-5-automation/planning/module-test-specification.md`
- **Test Implementation Plan** (per ticket): `.prompts/stage-5-automation/planning/test-implementation-plan.md`
