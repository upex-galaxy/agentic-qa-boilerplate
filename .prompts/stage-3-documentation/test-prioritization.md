# Test Prioritization

> Apply **strict** ROI analysis to determine which tests are really worth keeping in regression.

---

## Purpose

Prioritize test candidates with a **Risk-Based Testing** approach, being **very selective** about what enters regression to minimize maintainability.

**Key questions this prompt answers:**

1. **Does this test protect against FUTURE regressions?** → Not just validating initial implementation
2. **Is the maintenance cost worth it?** → Every test has a cost
3. **How many tests do we REALLY need?** → Less is more

**CRITICAL CONTEXT:**

The User Story is already **QA Approved**:

- ALL tests ALREADY PASSED
- Bugs have BEEN CLOSED
- We are NOT designing tests to execute

**We are deciding:** Which of those tests that already passed are worth RUNNING again in the future?

---

## Prerequisites

**Load required context:**

```
Read: .context/guidelines/QA/jira-test-management.md
```

---

## Input Required

- Analysis report from `test-analysis.md`
- List of candidates with classifications
- List of related prior bugs (for risk analysis)

---

## Workflow

### Phase 0: Critical Risk-Based Testing Questions

**REQUIRED:** Before calculating ROI, answer these questions for EACH candidate:

#### Question 1: Does it protect against FUTURE regressions?

```
If someone makes code changes in 3 months, will this test prevent them from breaking something?

- YES → Continue evaluation
- NO → Probably was one-time validation, DEFER
```

**Indicators of "Does NOT protect":**

- Error was a typo or initially incorrect implementation
- Area of code is very stable, nobody touches it
- Extremely rare edge case (< 1% of users)
- One-time validation (pluralization, copy, etc.)

#### Question 2: Are there PRIOR bugs related?

```
Is this scenario related to a bug that was already found and closed?

- YES → Higher probability of regression, PRIORITIZE
- NO → Evaluate normally
```

**Rule:** If it failed once, it can fail again. Prior bugs = higher risk.

#### Question 3: Is it better validated at APP level or FEATURE level?

```
Does this validation apply to the ENTIRE app or just this feature?

- APP level → Don't create per-feature test (examples: XSS, global error handling, responsive)
- FEATURE level → Create specific test
```

**APP-level validations (NOT per-feature tests):**

- XSS prevention → Global security suite
- Error handling → Global resilience tests
- Mobile responsive → Execute tests in multiple viewports
- Performance → Global app metrics
- Accessibility → Global a11y suite

---

### Phase 1: Calculate ROI for Each Candidate (Strict)

**Only evaluate candidates that passed the 3 Phase 0 questions.**

**ROI Formula:**

```
ROI = (Frequency × Impact × Stability) / (Effort × Dependencies)

Where each factor is scored 1-5:

FREQUENCY (How often will it be executed?)
- 5: Every PR / commit
- 4: Daily
- 3: Every sprint
- 2: Every release
- 1: Occasionally

IMPACT (How serious if it fails?)
- 5: Affects revenue / core business
- 4: Blocks main feature
- 3: Degrades user experience
- 2: Minor inconvenience
- 1: Cosmetic / low impact

STABILITY (How stable is the flow?)
- 5: Very stable, rarely changes
- 4: Stable, minor changes
- 3: Moderate, changes every sprint
- 2: Unstable, changes frequently
- 1: Very volatile, in active development

EFFORT (How much to automate?)
- 1: Trivial (minutes)
- 2: Low (hours)
- 3: Moderate (1-2 days)
- 4: High (several days)
- 5: Very high (week+)

DEPENDENCIES (How many integrations?)
- 1: None / self-contained
- 2: 1-2 simple dependencies
- 3: 3-4 dependencies
- 4: 5+ dependencies
- 5: Complex external dependencies
```

**ROI Interpretation (STRICT Thresholds):**

| ROI Score | Decision                    | Action                                  |
| --------- | --------------------------- | --------------------------------------- |
| > 5.0     | **Automate**                | Excellent ROI, include in regression    |
| 3.0 - 5.0 | **Automate with caution**   | Evaluate if there's a simpler alternative |
| 1.5 - 3.0 | **Evaluate case by case**   | Is there a prior bug? Is it critical flow? |
| 0.5 - 1.5 | **Probably defer**          | Only include if there's a prior bug     |
| < 0.5     | **Defer**                   | Not worth maintaining in regression     |

**Change vs previous version:** Thresholds are higher because:

- Every test has maintenance cost
- Most bugs don't recur after the first fix
- Fewer well-chosen tests > many low-value tests

---

### Phase 2: Apply Risk Matrix

```
                    HIGH BUSINESS IMPACT
                           │
           ┌───────────────┼───────────────┐
           │   CRITICAL    │    HIGH       │
           │  Automate     │  Automate     │
           │  First        │  Second       │
           │               │               │
HIGH ──────┼───────────────┼───────────────┼────── LOW
FAILURE    │               │               │      FAILURE
RISK       │    MEDIUM     │    LOW        │      RISK
           │  Automate     │  Manual or    │
           │  Third        │  Defer        │
           │               │               │
           └───────────────┼───────────────┘
                           │
                    LOW BUSINESS IMPACT
```

---

### Phase 3: Evaluate Component Value

**Reusability bonus:**

A test that is a component of multiple E2E flows has higher value:

```
Component Value = Base ROI × (1 + 0.2 × N)

Where N = number of E2E flows that use it

Example:
- "Successful login" used in 5 E2E flows
- Base ROI = 1.5
- Component Value = 1.5 × (1 + 0.2 × 5) = 1.5 × 2.0 = 3.0
- Result: High priority to automate
```

---

### Phase 4: Final Decision per Candidate

**For EACH candidate, apply this decision table:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DECISION TREE PER CANDIDATE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Did it pass the 3 Phase 0 questions?                                       │
│  ├─ NO → DEFER (doesn't protect against future regressions)                │
│  └─ YES ↓                                                                   │
│                                                                             │
│  Does it have a related prior bug?                                          │
│  ├─ YES → PRIORITIZE (include even if ROI is moderate)                     │
│  └─ NO ↓                                                                    │
│                                                                             │
│  ROI > 3.0?                                                                 │
│  ├─ YES → AUTOMATE                                                          │
│  └─ NO ↓                                                                    │
│                                                                             │
│  Is it the main/critical flow of the feature?                               │
│  ├─ YES → Consider 1 test that covers the main happy path                  │
│  └─ NO → DEFER                                                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Phase 5: Consolidate into Tracks (Minimum Result)

**Track 1: Automated Regression (CI/CD)**

- Passed decision tree
- ROI > 3.0 OR has prior bug
- Executes on every PR or nightly

**Track 2: Manual Regression** (use with caution)

- ROI 1.5 - 3.0 AND not automatable
- Very few tests should be here
- Executes before release

**Track 3: Deferred** (majority of candidates)

- Didn't pass decision tree
- ROI < 1.5 without prior bug
- Already validated in first execution, very unlikely to fail

**GOAL:** Most candidates should be DEFERRED. If more than 50% go to regression, review if we're being too permissive.

---

### Phase 6: Determine Workflow Path

Based on analysis, decide the workflow path:

```
For each test candidate:

IF (ROI > 1.5 AND Automatable = Yes):
    → Path: Ready → In Review → Candidate
    → Result: Ready for Stage 4 (Automation)

IF (ROI > 0.5 AND Automatable = No):
    → Path: Ready → Manual
    → Result: Manual regression

IF (ROI 1.0-1.5 AND Automatable = Yes):
    → Path: Ready → In Review
    → Result: Evaluate with more context
    → Can go to Candidate or Manual

IF (ROI < 0.5):
    → Don't document
    → Or document as Draft and defer
```

---

### Phase 7: Generate Prioritization Report

```markdown
# Test Prioritization Report

**Feature:** [Feature/US name]
**Date:** [Date]
**Initial Total Candidates:** [N]
**Candidates that passed filter:** [M] (target: < 50% of total)

---

## Phase 0: Critical Questions Filter

| #   | Scenario                  | Protects future? | Prior bug? | Feature level? | Passes filter? |
| --- | ------------------------- | ---------------- | ---------- | -------------- | -------------- |
| 1   | [Name with nomenclature]  | YES/NO           | YES/NO     | YES/NO         | Pass/Fail      |
| 2   | [Name with nomenclature]  | YES/NO           | YES/NO     | YES/NO         | Pass/Fail      |

**Result:** [X] of [N] candidates pass the initial filter.

---

## ROI Analysis (Only candidates that passed filter)

| #   | Scenario (Nomenclature)  | Freq | Impact | Stab | Effort | Deps | ROI | Prior Bug | Decision    |
| --- | ------------------------ | ---- | ------ | ---- | ------ | ---- | --- | --------- | ----------- |
| 1   | Validate X when Y        | 4    | 5      | 4    | 2      | 2    | 5.0 | BUG-XXX   | AUTOMATE    |
| 2   | Validate A when B        | 3    | 3      | 5    | 2      | 1    | 4.5 | -         | AUTOMATE    |
| 3   | Validate C when D        | 2    | 2      | 4    | 3      | 2    | 1.3 | -         | DEFER       |

---

## Final Decision

### For Automated Regression

| #   | Scenario                           | ROI | Justification                             |
| --- | ---------------------------------- | --- | ----------------------------------------- |
| 1   | [Complete name with nomenclature]  | X.X | [Main flow / Prior bug / High ROI]        |

**Total:** [N] tests (target: 1-3 per simple feature, 3-5 per complex feature)

### Deferred (NOT entering regression)

| #   | Scenario  | ROI | Reason to defer                        |
| --- | --------- | --- | -------------------------------------- |
| X   | [Name]    | X.X | Already validated, very unlikely to fail |
| Y   | [Name]    | X.X | Rare edge case, one-time validation    |
| Z   | [Name]    | X.X | Validated at APP level, not per feature |

**Total deferred:** [M] (should be majority)

---

## Summary

| Metric | Before (candidates) | After (regression) | Reduction |
| ------ | ------------------- | ------------------ | --------- |
| Total  | [N]                 | [M]                | [X]%      |

| Track                | Count | Justification         |
| -------------------- | ----- | --------------------- |
| Automated Regression | [1-3] | Only the essential    |
| Manual Regression    | [0-1] | Almost never needed   |
| Deferred             | [N-M] | Majority              |

---

## For Test Documentation (next step):

**Tests to document in Jira:**

| Scenario  | Path        | Final Nomenclature                           |
| --------- | ----------- | -------------------------------------------- |
| [Name]    | → Candidate | `{US_ID}: TC1: Validate <CORE> <CONDITIONAL>` |

**Cross-cutting characteristics (NOT tests):**

| Characteristic    | How it's validated               |
| ----------------- | -------------------------------- |
| Mobile responsive | Execute tests in mobile viewport |
| XSS prevention    | Include in test data             |
| Performance       | Time assertions                  |
```

---

## Decision Point

After prioritization:

| Action             | Next Step                    |
| ------------------ | ---------------------------- |
| Tests prioritized  | → `test-documentation.md`    |
| All deferred       | → Close phase                |
| Needs more info    | → Return to `test-analysis.md` |

---

## Output

- **Filter applied:** How many candidates passed critical questions
- **Prioritized list:** With ROI scores and final decision
- **Tests for regression:** Minimum necessary (1-3 per simple feature)
- **Deferred documented:** With justification for why they don't enter
- **Nomenclature preserved:** Use same names as in Shift-Left/Exploratory

---

## Risk-Based Testing Principles

1. **Less is more:** Every test has maintenance cost
2. **Prior bugs prioritize:** If it failed once, it can fail again
3. **Majority deferred:** Most one-time tests don't need regression
4. **Right level:** Some validations are at APP level, not FEATURE
5. **Flow > fragments:** Prefer 1 complete flow test over 5 atomic tests
