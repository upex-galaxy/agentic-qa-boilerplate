# Test Prioritization

> Apply risk-based prioritization to determine which tests enter regression.

---

## Purpose

Prioritize test candidates based on risk, business value, and automation feasibility to build an effective regression suite.

**This prompt is executed AFTER:**

- Test analysis completed
- Regression candidates identified

---

## Input Required

- Test analysis report (from `test-analysis.md`)
- Or list of test candidates with classifications

---

## Prioritization Framework

### Risk-Based Testing Matrix

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

### Scoring Criteria

**Business Impact (1-5):**

| Score | Description                                      |
| ----- | ------------------------------------------------ |
| 5     | Core revenue flow (checkout, payments)           |
| 4     | Primary user feature (login, main functionality) |
| 3     | Secondary feature (settings, preferences)        |
| 2     | Nice-to-have feature                             |
| 1     | Rarely used, edge case                           |

**Failure Risk (1-5):**

| Score | Description                                      |
| ----- | ------------------------------------------------ |
| 5     | High complexity, frequent changes, past failures |
| 4     | Moderate complexity, integration points          |
| 3     | Standard complexity                              |
| 2     | Simple, stable code                              |
| 1     | Very stable, rarely changes                      |

**Priority = Business Impact × Failure Risk**

---

## Workflow

### Phase 1: Score Each Candidate

**For each test candidate from analysis:**

```markdown
| Scenario                     | Business Impact | Failure Risk | Score | Priority |
| ---------------------------- | --------------- | ------------ | ----- | -------- |
| Login with valid credentials | 5               | 4            | 20    | Critical |
| Password validation          | 4               | 3            | 12    | High     |
| Remember me option           | 2               | 2            | 4     | Low      |
```

---

### Phase 2: Apply Automation Criteria

**Filter by automatability:**

| Scenario            | Score | Automatable | Action            |
| ------------------- | ----- | ----------- | ----------------- |
| Login flow          | 20    | Yes         | Automate (E2E)    |
| Password validation | 12    | Yes         | Automate (E2E)    |
| Visual alignment    | 8     | No          | Manual regression |
| Third-party OAuth   | 10    | No          | Manual regression |

---

### Phase 3: Assign to Regression Tracks

**Track 1: Automated Regression (CI/CD)**

- Tests that run on every PR or nightly
- High priority + automatable

**Track 2: Manual Regression**

- Tests that require human execution
- High priority + not automatable

**Track 3: Deferred**

- Low priority tests
- May be added later

---

### Phase 4: Generate Prioritization Report

```markdown
# Test Prioritization Report

**Feature:** [Feature/US name]
**Date:** [Date]
**Total Candidates:** [N]

---

## Prioritization Summary

| Track                | Count | Execution            |
| -------------------- | ----- | -------------------- |
| Automated Regression | [N]   | CI/CD Pipeline       |
| Manual Regression    | [N]   | Sprint end / Release |
| Deferred             | [N]   | Backlog              |

---

## Automated Regression (Priority Order)

| Rank | Scenario                       | Score | Test Type   | ATC ID |
| ---- | ------------------------------ | ----- | ----------- | ------ |
| 1    | [Login with valid credentials] | 20    | E2E         | TBD    |
| 2    | [Password validation]          | 12    | E2E         | TBD    |
| 3    | [API authentication]           | 15    | Integration | TBD    |

**Estimated automation effort:** [X] ATCs

---

## Manual Regression

| Rank | Scenario                 | Score | Reason Not Automated |
| ---- | ------------------------ | ----- | -------------------- |
| 1    | [Visual alignment check] | 8     | Requires human eye   |
| 2    | [Third-party OAuth flow] | 10    | External dependency  |

**Manual execution time:** ~[X] minutes

---

## Deferred (Backlog)

| Scenario             | Score | Reason Deferred     |
| -------------------- | ----- | ------------------- |
| [Remember me option] | 4     | Low business impact |
| [Rare edge case X]   | 3     | Rarely exercised    |

---

## Recommendations

### Immediate Actions:

1. Document top [N] scenarios in Xray (next: test-documentation.md)
2. Mark automation candidates with label `automation-candidate`
3. Add manual tests to regression checklist

### For Stage 4 (Automation):

- Start with scenarios ranked 1-3
- Estimated [X] ATCs to implement
- Test types: [N] E2E, [M] Integration
```

---

## Decision Point

After prioritization:

| Action             | Next Step                    |
| ------------------ | ---------------------------- |
| Tests prioritized  | → `test-documentation.md`    |
| Skip documentation | → Directly to Stage 4 (rare) |

---

## Output

- Prioritized list of regression tests
- Clear separation: automated vs manual
- Scoring justification for each test
- Ready for Xray documentation
