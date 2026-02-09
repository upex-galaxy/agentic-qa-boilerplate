# Stage 2: Exploratory Testing

> **Purpose**: Execute exploratory testing sessions on deployed features.
> **When to use**: After feature deployment to staging, when Shift-Left test cases exist.

## Overview

Exploratory Testing is a hands-on testing approach where QA explores the application while simultaneously designing and executing tests. This stage validates functionality, discovers edge cases, and identifies defects BEFORE automation.

**Benefits:**
- Discover bugs that scripted tests might miss
- Validate real user experience
- Identify automation candidates
- Quick feedback on new features

## Prompts in This Stage

| Order | Prompt              | Purpose                        | Output                          |
| ----- | ------------------- | ------------------------------ | ------------------------------- |
| 1     | `smoke-test.md`     | Quick deployment validation    | Go/No-Go decision               |
| 2     | `ui-exploration.md` | UI exploratory testing         | Session notes with findings     |
| 3     | `api-exploration.md`| API exploratory testing        | API validation report           |
| 4     | `bug-report.md`     | Document and report bugs       | Bug issues in Jira              |

## Workflow Principle: SMOKE → EXPLORE → REPORT

```
1. Smoke Test (5-10 min)
         ↓
2. If PASSED → Exploratory Testing
         ↓
3. Document findings
         ↓
4. Report bugs if found
```

This ensures:
- Don't waste time on broken deployments
- Systematic exploration with evidence
- Quick bug reporting to development
- Clear decision on feature readiness

## Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EXPLORATORY TESTING WORKFLOW                              │
└─────────────────────────────────────────────────────────────────────────────┘

         ┌─────────────────────────────────────────┐
         │  Feature Deployed to Staging            │
         └────────────────┬────────────────────────┘
                          │
                          ▼
         ┌─────────────────────────────────────────┐
         │  1. smoke-test.md                       │
         │     - Validate deployment is functional │
         │     - Check basic access                │
         │     - Verify happy path works           │
         │     → 5-10 minutes max                  │
         └────────────────┬────────────────────────┘
                          │
              ┌───────────┴───────────┐
              │                       │
         ❌ FAILED                ✅ PASSED
              │                       │
              ▼                       ▼
    ┌─────────────────┐   ┌─────────────────────────┐
    │ Report blocker  │   │ 2. ui-exploration.md    │
    │ Wait for fix    │   │    OR api-exploration.md│
    │ Re-run smoke    │   │    - Execute scenarios  │
    └─────────────────┘   │    - Test edge cases    │
                          │    - Document findings  │
                          └────────────┬────────────┘
                                       │
                          ┌────────────┴────────────┐
                          │                         │
                    Issues Found              No Issues
                          │                         │
                          ▼                         ▼
         ┌─────────────────────────┐   ┌─────────────────────────┐
         │ 3. bug-report.md        │   │ ✅ Ready for Automation │
         │    - Retest to confirm  │   │    Proceed to Stage 3   │
         │    - Document with      │   └─────────────────────────┘
         │      evidence           │
         │    - Create in Jira     │
         └─────────────────────────┘
```

## Prerequisites

Before running these prompts:

- [ ] Feature deployed to staging
- [ ] Shift-Left test cases available (`.context/PBI/.../test-cases.md`)
- [ ] Staging URL accessible
- [ ] MCP tools configured:
  - Playwright MCP for UI testing
  - Atlassian MCP for bug reporting

## Key Concepts

### Smoke Test vs Exploratory Testing

| Aspect       | Smoke Test         | Exploratory Testing    |
| ------------ | ------------------ | ---------------------- |
| **Duration** | 5-10 minutes       | 60-90 minutes          |
| **Scope**    | Happy path only    | Full coverage          |
| **Goal**     | Go/No-Go decision  | Find bugs, edge cases  |
| **Depth**    | Surface validation | Deep investigation     |

### UI vs API Exploration

| Aspect       | UI Exploration          | API Exploration        |
| ------------ | ----------------------- | ---------------------- |
| **Focus**    | User interface flows    | API contracts          |
| **Tools**    | Playwright MCP          | Postman/REST clients   |
| **Tests**    | Visual, interactions    | Payloads, responses    |

### Bug Severity Guidelines

| Severity     | Criteria                              |
| ------------ | ------------------------------------- |
| **Critical** | Core functionality blocked, data loss |
| **High**     | Major feature broken                  |
| **Medium**   | Feature issue with workaround         |
| **Low**      | Cosmetic, doesn't affect function     |

## MCP Integration

This stage uses:

- **Playwright MCP**: UI navigation, snapshots, screenshots
- **Atlassian MCP**: Bug creation in Jira, story linking
- **Postman MCP**: API testing (if available)

## When to Re-run

| Situation                    | Action                          |
| ---------------------------- | ------------------------------- |
| Smoke test failed            | Wait for fix, re-run smoke      |
| Bug fixed and redeployed     | Re-run affected exploratory     |
| New stories added            | Run smoke + exploratory for new |
| Regression detected          | Full exploratory re-run         |

## Output Files Location

```
.context/PBI/epics/
└── EPIC-{KEY}-{NUM}-{name}/
    └── stories/
        └── STORY-{KEY}-{NUM}-{name}/
            ├── smoke-test.md           # Smoke test results
            └── exploratory-notes.md    # Session findings
```

## Integration with Other Stages

After Exploratory Testing is complete:

- **Stage 3 (Documentation)**: Create formal test documentation
- **Stage 4 (Automation)**: Automate validated scenarios

---

**Related**: [Stage 1 - Shift-Left](../stage-1-shift-left/) | [Stage 3 - Documentation](../stage-3-documentation/)
