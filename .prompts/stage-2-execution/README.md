# Stage 2: Exploratory Testing

## Purpose

Execute manual exploratory testing to validate functionality and discover defects BEFORE investing in test automation.

**Why exploratory testing first:**

- Rapid feedback (minutes vs hours)
- Finds bugs that automated tests miss
- Validates features before automating
- Shift-left = feedback as early as possible

---

## The Triforce of Testing

This stage supports **complete feature validation** through three testing layers:

```
┌─────────────────────────────────────────────────────────────┐
│                    TRIFORCE TESTING                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │     UI      │  │     API     │  │     DB      │         │
│  │  Testing    │  │  Testing    │  │  Testing    │         │
│  │             │  │             │  │             │         │
│  │ Playwright  │  │  Postman/   │  │   DBHub     │         │
│  │    MCP      │  │ OpenAPI MCP │  │    MCP      │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  ui-exploration    api-exploration   db-exploration         │
│  .md               .md               .md                    │
└─────────────────────────────────────────────────────────────┘
```

**Choose based on feature type:**

| Feature Type         | Recommended Testing            |
| -------------------- | ------------------------------ |
| UI-focused feature   | UI → API → DB                  |
| API-first feature    | API → DB → UI (if applicable)  |
| Data-focused feature | DB → API → UI (if applicable)  |
| Full-stack feature   | All three (Complete Triforce)  |

---

## Prerequisites

- Feature deployed to staging
- User Story in "Ready For QA" status
- Test cases from Shift-Left Testing (or Acceptance Criteria)
- MCPs configured for the testing layer(s) needed

---

## Entry / Exit Criteria

### Entry Criteria

- [ ] Feature deployed to staging environment
- [ ] User Story in "Ready For QA" status
- [ ] Test cases or Acceptance Criteria available (from Stage 1 or Jira)
- [ ] Required MCPs configured (Playwright, Postman, DBHub as needed)
- [ ] Staging URL accessible

### Exit Criteria

- [ ] Smoke test PASSED (or blocker reported)
- [ ] Exploratory testing completed for relevant layers (UI/API/DB)
- [ ] Session notes documented with findings
- [ ] Bugs reported in Jira (if any found)
- [ ] US transitioned to "QA Approved" (if PASSED) or "Failed" (if issues)

---

## Prompts in This Stage

| Order | Prompt                 | Purpose                               | MCP Required     |
| ----- | ---------------------- | ------------------------------------- | ---------------- |
| 1     | `smoke-test.md`        | Quick validation that deployment works | playwright       |
| 2a    | `ui-exploration.md`    | Deep UI exploration                   | playwright       |
| 2b    | `api-exploration.md`   | Deep API exploration                  | postman, openapi |
| 2c    | `db-exploration.md`    | Deep database verification            | dbhub            |
| 3     | `bug-report.md`        | Report defects found (conditional)    | atlassian        |

**Note:** 2a, 2b, 2c can be executed in any order or combination based on feature needs.

---

## Execution Flow

```
US Status: Ready For QA
        ↓
[1] Smoke Test (5-10 min)
    └── FAILED? → Report blocker, STOP
        ↓
[2] Exploratory Testing (choose based on feature)
    │
    ├── [2a] UI Testing (ui-exploration.md)
    │   └── Uses Playwright MCP for UI exploration
    │   └── Validates user experience
    │
    ├── [2b] API Testing (api-exploration.md)
    │   └── Uses Postman/OpenAPI MCP
    │   └── Validates backend contracts, auth, RLS
    │
    └── [2c] DB Testing (db-exploration.md)
        └── Uses DBHub MCP for SQL verification
        └── Validates data integrity, constraints, triggers
        ↓
[3] Bug Report (if issues found)
    └── Use bug-report.md for each issue
    └── Report to Jira (with human confirmation)
        ↓
Decision: PASSED or FAILED?
    └── PASSED → Transition US to "QA Approved"
    └── FAILED → Wait for fixes, re-test
```

---

## Tools Required

| MCP             | Purpose                                   | Prompt(s)          |
| --------------- | ----------------------------------------- | ------------------ |
| `playwright`    | UI exploration, screenshots, interactions | smoke, exploratory |
| `postman`       | API collections, authenticated flows      | api-exploration    |
| `openapi` (api) | API endpoint exploration                  | api-exploration    |
| `dbhub` (sql)   | SQL queries, data verification            | db-exploration     |
| `atlassian`     | Bug creation, story transitions           | bug-report         |

---

## Output

- Smoke test results (PASSED/FAILED)
- Exploratory session notes (UI, API, DB as applicable)
- RLS policy verification results (if API tested)
- Data integrity verification results (if DB tested)
- Bugs reported in Jira (if any)
- US transitioned to appropriate status

---

## When to Use Each Testing Layer

### UI Testing (`ui-exploration.md`)

- User-facing features
- Form validations visible to user
- Navigation and workflows
- Visual/UX issues

### API Testing (`api-exploration.md`)

- Endpoints without UI yet
- Authentication/authorization logic
- RLS policy verification
- API contracts and error handling
- Backend business logic

### DB Testing (`db-exploration.md`)

- Data created by API/UI operations
- Trigger and constraint verification
- Complex calculations
- Data migrations
- Bulk operations

---

## Recommended Combinations

### Full-Stack Feature (Complete Triforce)

```
1. API Testing → Verify backend works
2. DB Testing → Verify data is correct
3. UI Testing → Verify user experience
```

### Backend-Only Feature

```
1. API Testing → Verify endpoints
2. DB Testing → Verify data integrity
(No UI testing needed)
```

### Data Migration/Report Feature

```
1. DB Testing → Verify data transformation
2. API Testing → Verify reporting endpoints
(UI testing if report has UI)
```

---

## Key Concepts

### Smoke Test vs Exploratory Testing

| Aspect       | Smoke Test         | Exploratory Testing    |
| ------------ | ------------------ | ---------------------- |
| **Duration** | 5-10 minutes       | 60-90 minutes          |
| **Scope**    | Happy path only    | Full coverage          |
| **Goal**     | Go/No-Go decision  | Find bugs, edge cases  |
| **Depth**    | Surface validation | Deep investigation     |

### Bug Severity Guidelines

| Severity     | Criteria                              |
| ------------ | ------------------------------------- |
| **Critical** | Core functionality blocked, data loss |
| **High**     | Major feature broken                  |
| **Medium**   | Feature issue with workaround         |
| **Low**      | Cosmetic, doesn't affect function     |

---

## When to Re-run

| Situation                    | Action                          |
| ---------------------------- | ------------------------------- |
| Smoke test failed            | Wait for fix, re-run smoke      |
| Bug fixed and redeployed     | Re-run affected exploratory     |
| New stories added            | Run smoke + exploratory for new |
| Regression detected          | Full exploratory re-run         |

---

## Output Files Location

```
.context/PBI/epics/
└── EPIC-{KEY}-{NUM}-{name}/
    └── stories/
        └── STORY-{KEY}-{NUM}-{name}/
            ├── smoke-test.md           # Smoke test results
            └── exploratory-notes.md    # Session findings
```

---

## Next Stage

If exploratory testing **PASSED**:

- Proceed to **Stage 3: Test Documentation**
- Document test cases in Jira
- Identify automation candidates

---

## Related Documentation

- **QA Workflow:** `.prompts/us-qa-workflow.md`
- **KATA Guidelines:** `.context/guidelines/TAE/`
- **Stage 1:** `.prompts/stage-1-planning/README.md`
- **Stage 3:** `.prompts/stage-3-reporting/README.md`
- **Stage 4:** `.prompts/stage-4-documentation/README.md`
