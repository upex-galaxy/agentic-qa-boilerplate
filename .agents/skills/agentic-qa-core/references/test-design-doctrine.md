# Test-Design Doctrine — deriving test cases from acceptance criteria

> **Canonical, shared doctrine.** This is the single source of truth for *how* a
> test case / ATC is derived from an acceptance criterion (AC) anywhere in this
> repo. Cited by `shift-left-testing`, `sprint-testing`, `test-documentation`,
> and `test-automation`. When any of those skills design coverage, this file is
> the authority. Do not duplicate its content into a skill — cite it.

The mechanics of *structuring* a test case (the Precondition + Action + Assertion
identity rule, KATA ATC rules, naming conventions) live in each skill's own
references. **This file governs the upstream decision: what to test, how far past
the AC to go, and which technique derives the cases.**

---

## Part 1 — The five principles (doctrine, not suggestion)

These are binding. A coverage set that violates them is incomplete, regardless of
how clean the individual test cases look.

### Principle 1 — Verifying acceptance criteria is NOT testing

Confirming a story meets its ACs validates the **minimum**. *Passing* is not the
same as *probing*. An AC-pass confirms the business condition is satisfied; it
does **not** prove the system is robust, safe, or error-resistant. Coverage that
stops at "every AC is green" has tested nothing beyond the happy contract.

### Principle 2 — ACs define the floor, not the ceiling

ACs are the mandatory baseline for "done". Quality testing must **exceed** that
line, not rest on it. Treat the AC list as the entry condition to test design,
never as the exit condition.

> **Coverage is redefined** (this overrides any older "% of ACs verified" wording
> in skill references):
>
> ```
> Real coverage = AC-conformance (the floor)
>               + risk-beyond-AC (boundaries, errors, states, anomalies)
> ```
>
> Reporting "100% of ACs verified" is reporting the floor. State it as the floor,
> then report what was probed beyond it.

### Principle 3 — A criterion describes a condition; a test case explores it

An AC is a **business assertion**: what must be true when the story is complete.
A test case is a **concrete exploration**: it examines *how* that condition holds
or breaks under specific data, variants, and contexts. A criterion is not a test.
A test is the instrument that puts the criterion's truth under pressure.

### Principle 4 — The 1:N relationship (MANDATE: explode by default)

One AC almost always needs **several** test cases to be adequately covered — each
exercising a different partition, boundary, state, or context.

```
1 Acceptance Criterion  →  N Test Cases
```

**This repo's rule (explode-default / justify-to-collapse):**

- **Default = explode.** For every non-trivial AC, derive multiple cases by
  applying the techniques in Part 2 (at minimum: valid partition + invalid
  partition + boundary). Never assume one case covers a criterion.
- **Collapsing to a single case requires written justification.** Reduce an AC to
  one test case ONLY when it is *trivially atomic* (a single boolean condition,
  no ranges, no states, no interacting inputs) — and say so explicitly in the
  plan ("collapsed: trivially atomic, single boolean").
- **Anti-padding still applies — but via justification, not via default
  minimization.** Do not invent cases that add no new partition, boundary, state,
  or risk. The test is "does this case explore something a sibling case does
  not?", not "did we hit a target count?". There is no minimum count and no
  maximum count — the count is whatever the techniques in Part 2 yield.

> This inverts the old "do not force a minimum scenario count" framing. The bias
> is now **expansion with justified collapse**, not **minimization by default**.
> EP-style merging (one parameterized case for inputs with identical behavior) is
> still correct — that is collapsing *within* a partition, which the techniques
> themselves prescribe. It must never be used to collapse *across* distinct
> partitions, boundaries, or states.

### Principle 5 — Risk lives OUTSIDE the criterion

ACs describe the expected path, rarely the deviations. Defects cluster where the
AC is silent:

- **Boundaries** — min, max, zero, empty, overflow, off-by-one, first/last.
- **Exceptions** — invalid data, wrong formats, null/missing inputs, type errors.
- **Unforeseen conditions** — concurrency, out-of-order sequences, dependency
  failures, partial state.
- **Anomalous behavior** — timeouts, retries, partial degradation, idempotency on
  double-submit, rollback on partial failure.

The test case is what hunts what the criterion does not contemplate. Every
coverage set must include risk-beyond-AC cases or it is incomplete.

---

## Part 2 — Formal techniques (taught once, applied by trigger)

Pick the technique by the *shape* of the AC. The triggers below are binding: when
a trigger fires, the named technique is required, not optional.

### Equivalence Partitioning (EP) — ALWAYS the starting lens

Divide every input domain into classes that the system should treat identically:
valid classes + invalid classes. Test **one representative per class** (testing
more from the same class adds cost, not coverage). EP is the default first move
for any AC with an input.

- **One case per partition** — a valid case, plus a case per *distinct* invalid
  reason (too long ≠ wrong format ≠ empty — different partitions).
- EP is what lets you collapse same-behavior inputs into one parameterized case
  *inside* a partition. It is also what forces *separate* cases *across*
  partitions (Principle 4).

### Boundary Value Analysis (BVA) — REQUIRED wherever a range or limit exists

Defects swarm at edges. For any bounded field, range, count, length, date window,
or quantity, test the boundary and its neighbours:

```
min-1 | min | min+1 ............ max-1 | max | max+1
        + zero / empty / null / first / last / overflow
```

- **Trigger (binding):** the AC or its data involves any numeric range, string
  length, collection size, date/time window, pagination, quota, or limit → BVA
  cases are mandatory. EP without BVA misses off-by-one defects.

### State-Transition testing — REQUIRED for stateful entities

When an entity moves through states (draft → submitted → approved; cart → paid →
shipped; account active → locked → closed), model the state machine and cover:

- Every **valid transition** (trigger + guard → next state).
- **Invalid transitions** (trigger fired in a state that should reject it).
- Entry/exit and terminal states; re-entrancy (same trigger twice).

- **Trigger (binding):** the AC describes a status, lifecycle, workflow step, or
  any field whose legal next value depends on its current value → cover the
  transition table, not just the target state.

### Decision Tables — REQUIRED when 2+ conditions interact

When the outcome depends on a **combination** of conditions (e.g. role × feature
flag × account status), build a decision table: enumerate condition combinations,
collapse impossible/equivalent columns, and derive one case per surviving rule.
This is the systematic alternative to guessing which combinations matter.

- **Trigger (binding):** an AC's outcome is governed by 2+ boolean/categorical
  conditions that interact → a decision table drives the cases. Do not test only
  the combinations the AC happens to mention.

### Pairwise / combinatorial reduction — REQUIRED when 3+ combinable factors

When 3+ independent factors each have multiple values, the full cartesian product
explodes. Use pairwise (all-pairs) selection: cover every *pair* of factor-values
at least once. This catches the vast majority of interaction defects at a
fraction of the cases.

- **Trigger (binding):** 3+ factors with ≥2 values each (e.g. browser × locale ×
  plan × payment-method) → reduce with pairwise instead of testing the full grid
  or arbitrarily sampling. Log that pairwise was applied (so the reduction is
  visible, not a silent cap).

### Error Guessing / exploratory charters — the experience layer

Beyond systematic techniques, deliberately probe what experience says breaks:
empty submit, double-click, back-button mid-flow, paste of `<script>` / SQL,
huge payloads, Unicode/emoji, expired token, clock skew, network drop. Frame
exploration as a **charter** (a time-boxed mission against a specific risk area),
not aimless clicking. Charters complement — never replace — the systematic cases.

### Risk-based prioritization — orders the set, never truncates it silently

Once cases are derived, prioritize by risk = likelihood × impact (data integrity,
security, money, blast radius). Risk decides **order** and **what automates
first**, not what gets dropped. If scope forces dropping cases, that drop is
explicit and logged — never a silent omission disguised as "covered".

---

## Part 2.5 — Parametrization: one artifact, many data rows (artifact economy)

Deriving widely (Principle 4) does NOT mean authoring one artifact per data value.
The lever that keeps coverage high while artifact count low is **parametrization**:

> **One parameterized artifact per equivalence partition** — same preconditions,
> same actions, **only the data varies**, same expected outcome-shape. The varying
> rows (boundaries, valid representatives, distinct invalid inputs of the *same*
> behavior) live INSIDE that one artifact, not as N separate test cases / ATCs.

This is the operational consequence of EP + BVA, stated as doctrine so it is not
re-derived ad hoc:

- **Parametrize when**: precondition + action are fixed and only the input data
  changes while the *outcome behavior* is the same (e.g. every invalid-credential
  variant → 401). Render the variants as data rows; one artifact.
- **Split when**: the action, the outcome, the status code, or the system state
  differs (e.g. valid → 200, locked → 423, at `max+1` → 400). Different behavior
  = different artifact, even if the input field is the same.
- **The split rule and the explode rule are the same rule** seen from two sides:
  explode *across* partitions/boundaries/states (separate artifacts); collapse
  *within* a partition (data rows in one artifact). Parametrization is the
  collapse half; it never erases a distinct partition/boundary/state.

**Two materializations of the same doctrine** (the downstream skills own the
syntax, not this file):

| Layer | One parameterized artifact = | Where the data rows live |
|---|---|---|
| Manual / TMS (`test-documentation`) | one Gherkin `Scenario Outline` Test | the `Examples:` table (one block per partition) |
| Automation / KATA (`test-automation`) | one parameterized `@atc` | a fixture file / data factory iterated by the test |

Net effect: a money-withdrawal AC with ~20 derived cases may become **3–5
parameterized artifacts** (valid-range outline, below/above-min boundary outline,
account-state outline, decision-rule outline) — each carrying many data rows —
instead of 20 artifacts. Coverage is unchanged; the TMS / suite stays legible.
Combinatorial techniques (Decision Table, Pairwise) reduce the *rows* inside an
`Examples`/fixture set; EP/BVA decide *how many artifacts* the rows split across.

---

## Part 3 — Test-Design Checklist (the gate)

Run this whenever deriving cases from an AC set. A plan that cannot answer YES (or
a justified N/A) to each is not done.

```
[ ] P1  Did I go beyond "every AC passes"? Listed risk-beyond-AC cases?
[ ] P2  Is the AC treated as the floor — is there coverage above the line?
[ ] P3  Is each test case a concrete exploration (data/context/state), not a
        restatement of the AC?
[ ] P4  For each non-trivial AC: multiple cases derived? Any AC collapsed to 1
        case carries a written "trivially atomic" justification?
[ ] P5  Did I add boundary / exception / unforeseen / anomaly cases the AC is
        silent on?
[ ] EP   Partitions identified (valid + each distinct invalid)?
[ ] BVA  Every range/limit/length/date-window has boundary cases? (or N/A: no ranges)
[ ] ST   Stateful entity → transition table covered, incl. invalid transitions?
         (or N/A: stateless)
[ ] DT   2+ interacting conditions → decision table built? (or N/A: ≤1 condition)
[ ] PW   3+ combinable factors → pairwise applied + logged? (or N/A: <3 factors)
[ ] PARAM Same-behavior data variants collapsed into ONE parameterized artifact
         per partition (Examples / fixture rows), not N separate artifacts?
[ ] RISK Cases prioritized; any scope-driven drop logged explicitly?
```

**N/A is a valid answer — but it must be a deliberate, stated N/A, not a skipped
line.** "No ranges in this AC, BVA N/A" is correct. Leaving BVA unconsidered is a
gap.

---

## Part 4 — Worked micro-example

> **AC:** "A user can withdraw between $10 and $5,000 per transaction from a
> verified account."

A floor-only reading = one test: withdraw $100 from a verified account → success.
That is Principle 1's trap.

Doctrine-driven derivation:

| Technique | Cases derived |
|---|---|
| EP | valid amount (verified) → success · amount below min → reject · amount above max → reject · unverified account → reject (distinct invalid partition) |
| BVA | $9.99 / $10.00 / $10.01 · $4,999.99 / $5,000.00 / $5,000.01 · $0 · negative · empty |
| State-Transition | account states: verified → ok · pending-verification → reject · locked → reject · closed → reject |
| Decision Table | (verified?) × (amount in range?) × (sufficient balance?) → enumerate rules incl. verified+in-range+insufficient-funds |
| Error Guessing | double-submit (idempotency) · withdraw during a concurrent withdrawal (race) · provider timeout mid-transaction (rollback?) |

One AC → ~20 meaningful cases, each exploring something the others do not. None is
padding; each maps to a partition, boundary, state, rule, or named risk.
