# Test-design doctrine: deriving test cases from acceptance criteria

> Canonical, shared doctrine. This is the single source of truth for how a test case or ATC is
> derived from an acceptance criterion (AC) anywhere in this repo. `shift-left-testing`,
> `sprint-testing`, `test-documentation` and `test-automation` cite it; when they design
> coverage, this file is the authority, so cite it instead of copying it into a skill.

How a test case is structured (the Precondition + Action + Assertion identity rule, KATA ATC
rules, naming) lives in each skill's own references. This file governs the upstream decision:
what to test, how far past the AC to go, and which technique derives the cases.

---

## Part 1: the five principles

These bind. A coverage set that breaks them is incomplete however clean each case looks.

### Principle 1: verifying acceptance criteria is not testing

Confirming a story meets its ACs validates the minimum. Passing is not probing: an AC-pass
shows the business condition holds, and says nothing about whether the system is robust, safe
or error-resistant. Coverage that stops at "every AC is green" has tested the happy contract
and nothing past it.

### Principle 2: ACs define the floor, not the ceiling

ACs are the mandatory baseline for "done". Quality testing goes past that line, so the AC list
is where test design starts, never where it ends.

> Coverage is redefined here (this overrides any older "% of ACs verified" wording in skill
> references):
>
> ```
> Real coverage = AC-conformance (the floor)
>               + risk-beyond-AC (boundaries, errors, states, anomalies)
> ```
>
> "100% of ACs verified" reports the floor. State it as the floor, then report what was probed
> beyond it.

### Principle 3: a criterion describes a condition; a test case explores it

An AC is a business assertion: what must be true when the story is complete. A test case is a
concrete exploration of how that condition holds or breaks under specific data, variants and
contexts. A criterion is not a test; the test is the instrument that puts the criterion's truth
under pressure.

### Principle 4: the 1:N relationship (explode by default)

One AC almost always needs several test cases, each exercising a different partition,
boundary, state or context.

```
1 Acceptance Criterion  →  N Test Cases
```

This repo's rule is explode by default and justify any collapse:

- For every non-trivial AC, derive multiple cases with the Part 2 techniques (at minimum a
  valid partition, an invalid partition and a boundary). One case rarely covers a criterion.
- Reduce an AC to a single case only when it is trivially atomic (a single boolean condition,
  no ranges, no states, no interacting inputs), and say so in the plan ("collapsed: trivially
  atomic, single boolean").
- Anti-padding still applies, through justification and not through default minimization. A
  case that adds no new partition, boundary, state or risk is padding. The test is "does this
  case explore something a sibling case does not?", not "did we hit a target count?". There is
  no minimum and no maximum count; the techniques in Part 2 yield the count.

> The bias is expansion with justified collapse. EP-style merging (one parameterized case for
> inputs with identical behavior) is still correct, because that collapses within a partition,
> as the techniques themselves prescribe. It must not collapse across distinct partitions,
> boundaries or states.

### Principle 5: risk lives outside the criterion

ACs describe the expected path and rarely the deviations. Defects cluster where the AC is silent:

- Boundaries: min, max, zero, empty, overflow, off-by-one, first/last.
- Exceptions: invalid data, wrong formats, null or missing inputs, type errors.
- Unforeseen conditions: concurrency, out-of-order sequences, dependency failures, partial state.
- Anomalous behavior: timeouts, retries, partial degradation, idempotency on double-submit,
  rollback on partial failure.

The test case hunts what the criterion does not contemplate, so every coverage set includes
risk-beyond-AC cases.

---

## Part 2: formal techniques, applied by trigger

Pick the technique by the shape of the AC. The triggers below bind: when one fires, the named
technique is required.

### Equivalence Partitioning (EP): always the starting lens

Divide every input domain into classes the system should treat identically, valid and invalid.
Test one representative per class; more from the same class adds cost and no coverage. EP is
the first move for any AC with an input.

- One case per partition: a valid case, plus a case per distinct invalid reason (too long,
  wrong format and empty are different partitions).
- EP lets you collapse same-behavior inputs into one parameterized case inside a partition,
  and it forces separate cases across partitions (Principle 4).

### Boundary Value Analysis (BVA): required wherever a range or limit exists

Defects swarm at edges. For any bounded field, range, count, length, date window or quantity,
test the boundary and its neighbours:

```
min-1 | min | min+1 ............ max-1 | max | max+1
        + zero / empty / null / first / last / overflow
```

- Trigger: the AC or its data involves a numeric range, string length, collection size,
  date/time window, pagination, quota or limit. BVA cases are then mandatory, since EP without
  BVA misses off-by-one defects.

#### BVA on the derived value: required wherever the functionality rounds or truncates

- Trigger: the AC or its implementation rounds or truncates a computed value (percentage,
  ratio, average, currency, or similar). Derive BVA cases against the output boundary, meaning
  the raw inputs nearest the point where rounding crosses into an extreme displayed value, in
  addition to the literal input min and max. With no rounding or truncation, this trigger is N/A.
- Worked example (a real defect from a downstream project):
  `coveragePercent = Math.round(bound / total * 100)`. Input-boundary BVA covered
  `bound = 0 → 0%` and `bound = total → 100%`, but missed `(199, 200) → 100%` and `(1, 201) → 0%`: inputs
  nowhere near the input boundary that round into the same displayed extreme and contradicted
  the breakdown shown on the same screen.

### State-Transition testing: required for stateful entities

When an entity moves through states (draft → submitted → approved; cart → paid → shipped;
account active → locked → closed), model the state machine and cover:

- every valid transition (trigger + guard → next state);
- invalid transitions (a trigger fired in a state that should reject it);
- entry, exit and terminal states, and re-entrancy (the same trigger twice).

Trigger: the AC describes a status, lifecycle, workflow step, or any field whose legal next
value depends on its current value. Cover the transition table, not only the target state.

### Decision Tables: required when 2+ conditions interact

When the outcome depends on a combination of conditions (role × feature flag × account status),
build a decision table: enumerate the combinations, collapse impossible or equivalent columns,
and derive one case per surviving rule. It is the systematic alternative to guessing which
combinations matter.

Trigger: an AC's outcome is governed by 2+ boolean or categorical conditions that interact. The
table drives the cases, including combinations the AC never mentions.

### Pairwise / combinatorial reduction: required when 3+ combinable factors

When 3+ independent factors each have multiple values, the full cartesian product explodes.
Pairwise (all-pairs) selection covers every pair of factor-values at least once, which catches
most interaction defects at a fraction of the cases.

Trigger: 3+ factors with at least 2 values each (browser × locale × plan × payment-method).
Reduce with pairwise instead of testing the full grid or sampling arbitrarily, and log that
pairwise was applied so the reduction is visible and not a silent cap.

### Error guessing and exploratory charters: the experience layer

Beyond the systematic techniques, probe what experience says breaks: empty submit,
double-click, back-button mid-flow, paste of `<script>` or SQL, huge payloads, Unicode and
emoji, expired token, clock skew, network drop. Frame exploration as a charter (a time-boxed
mission against a specific risk area) and not aimless clicking. Charters complement the
systematic cases and never replace them.

#### Trigger: a state the test seeds but the product may never produce

When it fires: a case's precondition is put in place by a shortcut (an API call, a DB seed, a
fixture row, an admin edit) instead of the product flow that creates it in real use, and the
screen or report under test derives something from it: a badge, a status, a total, a counter,
a filter result.

The risk: the case reads a field that only the seed ever writes. The test passes on seeded data
while in real use nothing fills that field, so the feature is dead in production under a green
suite: a counter stuck at zero, a status nobody can reach, an AC that cannot be satisfied.
Naming the field in the AC, the ticket or a decision comment is not evidence that any user
action or background job writes it.

Required case: at least one case produces that state through the real path (the user action,
the lifecycle step, the scheduled job that sets it in production) and then asserts the derived
value. Seeded cases stay; they are fast and they cover the variants. When no real path exists
in the target environment, the case is `BLOCKED — unreachable precondition` with what it would
take while recreation is still being tried, and `DEFERRED (execution)` once QA defers it, per
the section below. The gap itself may be the report worth filing.

### Unreachable preconditions: the empty state on a shared, long-lived account

A derived case is only real if the environment can be put into the state it needs. The
recurring case is the empty state: "with no orders yet, the list shows the onboarding panel".
On a shared staging account the whole team has used for a long time, zero orders is
unreachable and the case quietly becomes untestable. The measured failure (see ADR-0006) is
that the case was skipped silently, reported as covered, and the AC's own promise was never
checked.

Three legitimate outcomes, in order of preference:

1. **A fixture identity.** Create (or take) a dedicated account, tenant or workspace that
   exists to be empty, name it in the test's preconditions, and run the case there. This fits
   anything cheap to provision, and the same trick reaches a first-login, never-verified or
   zero-quota state.
2. **A reset path the product already has.** An owned tenant the test can empty, a seed
   script, a soft-delete the product exposes. Use it only when the case can afford the blast
   radius on a shared environment, and never empty data another session is using
   (`sprint-testing/references/fleet-conductor.md` §8 claims, when several sessions run).
3. **Declared unobservable, with a product decision attached.** When neither 1 nor 2 is
   available, the case is kept: it is `BLOCKED — unreachable precondition: <state>` while
   recreation is still being tried, and becomes `DEFERRED (execution) <date> by QA decision:
   <reason>; follow-up <KEY>` once QA defers it. The plan and the results carry that line, with
   what it would take (a fixture account, a seed hook, a reset endpoint). That is a product or
   test-environment decision to raise, not a QA omission to hide, and per the `Improvement`
   bridge it may itself be the report worth filing. In-sprint, this outcome is steps 2-4 of the
   blocking ladder in `discovery-driven-doctrine.md` §5 (QA deferral with a follow-up task).

Substituting a similar-looking state for the empty one ("only two orders" is not "none") gives
a false result, and so does marking such a case PASSED on a partial observation.

### Risk-based prioritization: orders the set, never truncates it silently

Once cases are derived, prioritize by risk = likelihood × impact (data integrity, security,
money, blast radius). Risk decides order and what automates first, not what gets dropped. If
scope forces dropping cases, the drop is explicit and logged, never a silent omission disguised
as "covered".

---

## Part 2.5: parametrization, one artifact with many data rows

Deriving widely (Principle 4) does not mean authoring one artifact per data value. The lever
that keeps coverage high and artifact count low is parametrization:

> One parameterized artifact per equivalence partition: same preconditions, same actions, only
> the data varies, same expected outcome-shape. The varying rows (boundaries, valid
> representatives, distinct invalid inputs of the same behavior) live inside that one artifact,
> not as N separate test cases or ATCs.

This is the operational consequence of EP and BVA, stated once so nobody re-derives it ad hoc:

- Parametrize when precondition and action are fixed and only the input data changes while the
  outcome behavior is the same (every invalid-credential variant gives 401). Render the
  variants as data rows in one artifact.
- Split when the action, the outcome, the status code or the system state differs (valid gives
  200, locked gives 423, at `max+1` gives 400). Different behavior is a different artifact,
  even when the input field is the same.
- The split rule and the explode rule are one rule seen from two sides: explode across
  partitions, boundaries and states (separate artifacts); collapse within a partition (data
  rows in one artifact). Parametrization is the collapse half and never erases a distinct
  partition, boundary or state.

The downstream skills own the syntax. The doctrine materializes two ways:

| Layer | One parameterized artifact = | Where the data rows live |
|---|---|---|
| Manual / TMS (`test-documentation`) | one Gherkin `Scenario Outline` Test | the `Examples:` table (one block per partition) |
| Automation / KATA (`test-automation`) | one parameterized `@atc` | a fixture file / data factory iterated by the test |

Net effect: a money-withdrawal AC with about 20 derived cases may become 3 to 5 parameterized
artifacts (valid-range outline, below/above-min boundary outline, account-state outline,
decision-rule outline), each carrying many data rows. Coverage is unchanged and the TMS or
suite stays legible. Combinatorial techniques (Decision Table, Pairwise) reduce the rows inside
an `Examples` or fixture set; EP and BVA decide how many artifacts the rows split across.

---

## Part 3: Test-Design Checklist (the gate)

Run this whenever deriving cases from an AC set. A plan that cannot answer YES (or a justified
N/A) to each line is not done.

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
[ ] BVA-D Does the feature round/truncate a computed value? If so, are there
         cases at the OUTPUT boundary, not just the raw-input boundary?
         (or N/A: no rounding/truncation)
[ ] ST   Stateful entity → transition table covered, incl. invalid transitions?
         (or N/A: stateless)
[ ] DT   2+ interacting conditions → decision table built? (or N/A: ≤1 condition)
[ ] PW   3+ combinable factors → pairwise applied + logged? (or N/A: <3 factors)
[ ] PARAM Same-behavior data variants collapsed into ONE parameterized artifact
         per partition (Examples / fixture rows), not N separate artifacts?
[ ] RISK Cases prioritized; any scope-driven drop logged explicitly?
[ ] OBS  Every case's precondition reachable in the target environment? Empty /
         first-time / zero-quota states either have a fixture identity or are
         `BLOCKED — unreachable precondition` while being recreated, then
         `DEFERRED (execution)` with what it would take?
         (or N/A: no case needs a state the environment cannot produce)
[ ] SEED A derived value read from seeded state → at least one case produces that
         state through the real product path and asserts the value?
         (or N/A: every precondition comes from the product flow itself)
```

N/A is a valid answer when it is stated on purpose. "No ranges in this AC, BVA N/A" is correct;
leaving BVA unconsidered is a gap.

---

## Part 4: worked micro-example

> **AC:** "A user can withdraw between $10 and $5,000 per transaction from a verified account."

A floor-only reading is one test: withdraw $100 from a verified account and see success. That
is Principle 1's trap.

Derivation by technique:

| Technique | Cases derived |
|---|---|
| EP | valid amount (verified) → success · amount below min → reject · amount above max → reject · unverified account → reject (distinct invalid partition) |
| BVA | $9.99 / $10.00 / $10.01 · $4,999.99 / $5,000.00 / $5,000.01 · $0 · negative · empty |
| State-Transition | account states: verified → ok · pending-verification → reject · locked → reject · closed → reject |
| Decision Table | (verified?) × (amount in range?) × (sufficient balance?) → enumerate rules incl. verified+in-range+insufficient-funds |
| Error Guessing | double-submit (idempotency) · withdraw during a concurrent withdrawal (race) · provider timeout mid-transaction (rollback?) |

One AC yields about 20 meaningful cases, each exploring something the others do not. None is
padding: each maps to a partition, boundary, state, rule or named risk.
