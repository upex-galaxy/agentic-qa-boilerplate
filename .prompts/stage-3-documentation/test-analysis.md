# Test Analysis

> Analyze exploratory testing results to identify regression test candidates.

---

## Purpose

Review the outcomes of exploratory testing to identify which scenarios should become regression tests.

**This prompt is executed AFTER:**

- Exploratory testing passed (US status: QA Approved)
- Session notes document validated scenarios

---

## Input Required

Provide ONE of the following:

1. **Exploratory session notes** - Path or content
2. **User Story ID** - To fetch related test information
3. **Epic ID** - For broader analysis across multiple stories

---

## Workflow

### Phase 1: Gather Context

**Read the exploratory findings:**

```
Sources to analyze:
├── Exploratory session notes
├── User Story acceptance criteria
├── Shift-Left test cases (if available)
└── Bug reports created (to understand problem areas)
```

**Extract:**

- Scenarios that were tested
- Outcomes (PASSED, FAILED, OBSERVATIONS)
- Edge cases discovered
- Areas of concern noted

---

### Phase 2: Classify Scenarios

**For each tested scenario, determine:**

| Classification | Criteria                             |
| -------------- | ------------------------------------ |
| **Critical**   | Core business flow, high user impact |
| **High**       | Important feature, frequent usage    |
| **Medium**     | Secondary feature, moderate impact   |
| **Low**        | Edge case, rare usage                |

**Also determine automatability:**

| Automatable            | Not Automatable            |
| ---------------------- | -------------------------- |
| Deterministic outcomes | Requires human judgment    |
| Stable locators/APIs   | Visual-only validation     |
| Repeatable steps       | Complex setup dependencies |
| Clear assertions       | Third-party integrations   |

---

### Phase 3: Generate Analysis Report

```markdown
# Test Analysis Report

**Feature:** [Feature/US name]
**Date:** [Date]
**Source:** [Exploratory session notes reference]

---

## Summary

- **Total scenarios analyzed:** [N]
- **Regression candidates:** [N]
- **Automation candidates:** [N]
- **Manual-only:** [N]
- **Deferred:** [N]

---

## Regression Test Candidates

### Critical Priority

| #   | Scenario        | Type       | Automatable | Notes                     |
| --- | --------------- | ---------- | ----------- | ------------------------- |
| 1   | [Scenario name] | Happy path | Yes         | Core login flow           |
| 2   | [Scenario name] | Validation | Yes         | Required field validation |

### High Priority

| #   | Scenario        | Type           | Automatable | Notes                 |
| --- | --------------- | -------------- | ----------- | --------------------- |
| 3   | [Scenario name] | Edge case      | Yes         | Boundary condition    |
| 4   | [Scenario name] | Error handling | No          | Requires visual check |

### Medium Priority

| #   | Scenario        | Type           | Automatable | Notes            |
| --- | --------------- | -------------- | ----------- | ---------------- |
| 5   | [Scenario name] | Secondary flow | Yes         | Alternative path |

### Low Priority / Deferred

| #   | Scenario        | Reason for Deferral |
| --- | --------------- | ------------------- |
| 6   | [Scenario name] | Rarely used feature |

---

## Automation Candidates Summary

**Ready for automation (Stage 4):**

1. [Scenario 1] - E2E
2. [Scenario 2] - API Integration
3. [Scenario 3] - E2E

**Manual regression only:**

1. [Scenario 4] - Requires visual validation
2. [Scenario 5] - Complex third-party dependency

---

## Recommendations

### For Test Documentation (next step):

- Document scenarios [1-5] in Xray as Test issues
- Use Gherkin format for clarity

### For Automation (Stage 4):

- Prioritize scenarios [1-3] for first automation sprint
- Consider [scenario 4] for future visual testing tools

### For Manual Regression:

- Add [scenarios 4-5] to manual regression checklist
```

---

## Decision Point

After analysis, proceed to:

| Scenarios Found                  | Next Step                  |
| -------------------------------- | -------------------------- |
| Regression candidates identified | → `test-prioritization.md` |
| No candidates (simple feature)   | → Skip to Stage 4 or close |

---

## Output

- Analysis report with classified scenarios
- List of regression test candidates
- Automation recommendations
- Ready for prioritization phase
