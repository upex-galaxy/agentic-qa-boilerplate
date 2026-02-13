# Stage 3: Test Documentation

## Purpose

Asynchronous documentation of **ATCs (Acceptance Test Cases)** in Jira **AFTER** the functionality has passed exploratory testing.

**Why this stage exists:**

- Features are validated first (rapid feedback)
- Documentation happens when the feature is stable
- ATCs are documented for regression (manual or automated)
- Clear traceability: **ATP (Stage 1) → ATCs (Stage 3) → KATA (Stage 4)**
- Automation decisions based on ROI

**IQL Connection:**
This stage corresponds to **Step 6 of Mid-Game Testing** - where scenarios from the ATP become formal ATCs.

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

| Order | Prompt                   | Purpose                                    |
| ----- | ------------------------ | ------------------------------------------ |
| 1     | `test-analysis.md`       | Analyze US, comments, and complete context |
| 2     | `test-prioritization.md` | Calculate ROI and decide path              |
| 3     | `test-documentation.md`  | Create Tests in Jira, transit workflow     |

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
    ├── Candidates → Stage 4: Test Automation
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

| Modality    | Tools                      |
| ----------- | -------------------------- |
| Native Jira | MCP Atlassian              |
| Jira + Xray | MCP Atlassian + `bun xray` |

---

## ATC Workflow

```
DRAFT → IN DESIGN → READY → [MANUAL | IN REVIEW → CANDIDATE]

Final regression states:
- MANUAL: ATC for manual regression
- AUTOMATED: ATC automated with KATA (after Stage 4)
```

**KATA Traceability:** Each ATC marked as CANDIDATE uses the `@atc('PROJECT-XXX')` decorator in Stage 4.

Complete visual reference in: `.context/guidelines/QA/jira-test-management.md`

---

## Regression Epic

**REQUIRED:** All tests must belong to a regression epic.

```
Search: project = PROJ AND issuetype = Epic AND (summary ~ "regression" OR labels = "test-repository")

If not exists → Create "{PROJECT} Test Repository"
```

---

## Test Classification

| Type            | Description                      | Automatable   |
| --------------- | -------------------------------- | ------------- |
| **E2E**         | Complete user flow               | Yes           |
| **Integration** | Communication between systems    | Yes           |
| **Functional**  | Specific isolated functionality  | Yes           |
| **Smoke**       | Basic verification               | Yes           |
| **Visual**      | Visual validation                | No (manual)   |

---

## Path Decisions

| ROI Score | Path                  | Final Status |
| --------- | --------------------- | ------------ |
| > 1.5     | → Candidate           | CANDIDATE    |
| 0.5 - 1.5 | → Evaluate / In Review| IN REVIEW    |
| < 0.5     | → Manual or Defer     | MANUAL       |

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

## Output from This Stage

- Tests created in Jira as Issue Type "Test"
- Tests linked to related User Stories
- Tests within Regression Epic
- States transitioned according to workflow
- Automation candidates ready for Stage 4
- Manual tests in regression suite

---

## Next Stage

For ATCs marked as **Candidate**:

- Proceed to **Stage 4: Test Automation**
- Implement ATCs following KATA architecture
- Each ATC is linked with `@atc('PROJECT-XXX')` for traceability

**IQL Connection:** This transition corresponds to Steps 7-10 of Mid-Game Testing (evaluation, automation, CI, and PR).

---

## Related Documentation

- **Guidelines:** `.context/guidelines/QA/jira-test-management.md`
- **QA Workflow:** `.prompts/us-qa-workflow.md`
- **KATA Guidelines:** `.context/guidelines/TAE/`
- **TMS Integration:** `.context/guidelines/TAE/tms-integration.md`
