# Stage 4: Test Documentation & Prioritization

> **Purpose**: Prioritize Test Cases for regression and formally document candidates.
> **When**: After Stage 3 (Reporting) is complete and the User Story is tested.
> **Prerequisite**: All TCs created and tested in Stage 2, results reported in Stage 3.

---

## Overview

Stage 4 is an **asynchronous documentation phase** following IQL methodology. The User Story is already tested and approved — now we decide which Test Cases are worth maintaining in regression.

**Key Principle:**
> Not all tests belong in regression. Most TCs are one-time validations that won't protect against future regressions.

This stage:
1. **Evaluates** TCs with ROI analysis
2. **Prioritizes** which TCs should be maintained
3. **Documents** formal specifications only for candidates
4. **Transitions** Workflow Status to Candidate/Manual

**IQL Connection:**
This stage corresponds to **Step 6 of Mid-Game Testing** — where scenarios from the ATP become formal ATCs.

---

## Prerequisites

- US status: "QA Approved" (exploratory testing passed)
- Exploratory session notes with validated scenarios
- Access to tools:
  - MCP Atlassian (required)
  - Xray CLI (`bun xray`) if the project uses Xray

**Required context:**

```
Read first: .context/guidelines/QA/jira-test-management.md
```

---

## Prompts in This Stage

| Order | Prompt | Purpose |
|-------|--------|---------|
| 1 | `test-analysis.md` | Analyze US, comments, and complete context |
| 2 | `test-prioritization.md` | Calculate ROI and decide path |
| 3 | `test-documentation.md` | Create Tests in TMS, transit workflow |

---

## Workflow Status Transitions

**This stage affects TC Workflow Status:**

| Action | Workflow Status Transition |
|--------|---------------------------|
| TC evaluated, high ROI, automatable | Ready → **Candidate** |
| TC evaluated, not automatable but needed | Ready → **Manual** |
| TC evaluated, low ROI | Stays as Ready (deferred) |

**Workflow Status Values:**

| Status | Description |
|--------|-------------|
| **Draft** | TC created, minimal info |
| **Ready** | TC has Name + AC + Status, tested |
| **Candidate** | TC approved for automation, formally documented |
| **Manual** | TC in manual regression (not automatable) |
| **In Automation** | TC being automated (Stage 5) |
| **In Review** | Automation PR created |
| **Automated** | Automation merged and running |

---

## Prioritization Framework

### ROI Formula

```
ROI = (Frequency × Impact × Stability) / (Effort × Dependencies)
```

### Decision Tree

1. **Does it protect against FUTURE regressions?**
   - NO → Defer (one-time validation)
   - YES → Continue

2. **Are there prior bugs related?**
   - YES → Prioritize (higher risk)
   - NO → Continue

3. **Is ROI > 3.0?**
   - YES → Candidate
   - NO → Continue

4. **Is it the main/critical flow?**
   - YES → Consider 1 happy path test
   - NO → Defer

### Expected Outcome

**Most TCs should be DEFERRED.** If more than 50% go to regression, review if being too permissive.

Target per User Story:
- Simple feature: 1-3 TCs for regression
- Complex feature: 3-5 TCs for regression

### Path Decisions (ROI Score)

| ROI Score | Path | Final Status |
|-----------|------|--------------|
| > 1.5 | → Candidate | CANDIDATE |
| 0.5 - 1.5 | → Evaluate / In Review | IN REVIEW |
| < 0.5 | → Manual or Defer | MANUAL |

---

## Execution Flow

```
US Status: QA Approved
        ↓
[1] Test Analysis
    ├── Read US, comments, linked issues (MCP Atlassian)
    ├── Identify test scenarios
    ├── Classify by type (E2E, Integration, Functional)
    └── Map reusable components (Lego)
        ↓
[2] Test Prioritization
    ├── Calculate ROI per scenario
    ├── Apply reusability bonus
    ├── Decide path: Candidate vs Manual vs Deferred
    └── Order by implementation priority
        ↓
[3] Test Documentation
    ├── Verify modality (native Jira vs Xray)
    ├── Verify/create regression epic
    ├── Create Tests (MCP Atlassian or Xray CLI)
    ├── Link to User Story
    └── Transit workflow: Draft → In Design → Ready → [Manual|Candidate]
        ↓
Output:
    ├── Candidates → Stage 5: Test Automation
    └── Manual → Manual regression suite
```

---

## Test Management Modalities

### Key Question

```
Does the project use Xray as a plugin?

- YES → Xray CLI (`bun xray`) + MCP Atlassian
- NO → Only MCP Atlassian with Issue Type "Test"
```

### Tools by Modality

| Modality | Tools |
|----------|-------|
| Native Jira | MCP Atlassian |
| Jira + Xray | MCP Atlassian + `bun xray` |

---

## Test Classification

| Type | Description | Automatable |
|------|-------------|-------------|
| **E2E** | Complete user flow | Yes |
| **Integration** | Communication between systems | Yes |
| **Functional** | Specific isolated functionality | Yes |
| **Smoke** | Basic verification | Yes |
| **Visual** | Visual validation | No (manual) |

---

## ATC Workflow

```
DRAFT → IN DESIGN → READY → [MANUAL | IN REVIEW → CANDIDATE]

Final regression states:
- MANUAL: ATC for manual regression
- AUTOMATED: ATC automated with KATA (after Stage 5)
```

**KATA Traceability:** Each ATC marked as CANDIDATE uses the `@atc('PROJECT-XXX')` decorator in Stage 5.

Complete visual reference in: `.context/guidelines/QA/jira-test-management.md`

---

## Regression Epic

**REQUIRED:** All tests must belong to a regression epic.

```
Search: project = PROJ AND issuetype = Epic AND (summary ~ "regression" OR labels = "test-repository")

If not exists → Create "{PROJECT} Test Repository"
```

---

## Xray CLI Commands

```bash
# Authentication
bun xray auth login --client-id "$XRAY_CLIENT_ID" --client-secret "$XRAY_CLIENT_SECRET"
bun xray auth status

# Create test
bun xray test create --project PROJ --summary "Test name" \
  --step "Action|Expected"

# Create Cucumber test
bun xray test create --project PROJ --type Cucumber \
  --summary "Feature" --gherkin "Feature: X\n  Scenario: Y"

# List tests
bun xray test list --project PROJ
```

---

## Entry Criteria

- [ ] Stage 3 completed (ATR filled, ticket tested)
- [ ] All TCs in Ready status
- [ ] No pending re-tests (all bugs fixed)

---

## Exit Criteria

- [ ] All TCs evaluated with ROI
- [ ] Candidates identified and transitioned to "Candidate" status
- [ ] Manual tests identified and transitioned to "Manual" status
- [ ] Candidate TCs formally documented:
  - Precondition (complete)
  - Specification (step-by-step)
  - Test Automation Plan (filled)

---

## Next Stage

After completing Stage 4:

**For Candidate TCs:**
→ Proceed to **Stage 5: Automation** to implement automated tests

**For Manual TCs:**
→ Add to manual regression suite (run before releases)

**For Deferred TCs:**
→ No further action needed (validation already done)

---

## Output from This Stage

- Tests created in TMS as Issue Type "Test"
- Tests linked to related User Stories
- Tests within Regression Epic
- States transitioned according to workflow
- Automation candidates ready for Stage 5
- Manual tests in regression suite

---

## Related Documentation

- **Guidelines:** `.context/guidelines/QA/jira-test-management.md`
- **QA Workflow:** `.prompts/us-qa-workflow.md`
- **KATA Guidelines:** `.context/guidelines/TAE/`
- **TMS Integration:** `.context/guidelines/TAE/tms-integration.md`
- **Stage 3 - Reporting:** `.prompts/stage-3-reporting/README.md`
- **Stage 5 - Automation:** `.prompts/stage-5-automation/README.md`
