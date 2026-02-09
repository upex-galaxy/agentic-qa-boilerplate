# Stage 1: Shift-Left Testing

> **Purpose**: Early test planning and analysis BEFORE implementation begins.
> **When to use**: When a new epic or story is being refined, BEFORE sprint starts.

## Overview

Shift-Left Testing is the practice of moving testing activities earlier in the development lifecycle. Instead of waiting for code to be written, QA analyzes requirements, identifies risks, and creates test plans during refinement.

**Benefits:**
- Early detection of ambiguities and gaps in requirements
- Reduced rework and bug fixing costs
- Better collaboration between PO, Dev, and QA
- Higher quality code from the start

## Prompts in This Stage

| Order | Prompt                   | Purpose                              | Output                                    |
| ----- | ------------------------ | ------------------------------------ | ----------------------------------------- |
| 1     | `feature-test-plan.md`   | Test plan for entire epic            | `.context/PBI/epics/EPIC-*/feature-test-plan.md` |
| 2     | `story-test-cases.md`    | Detailed test cases per story        | `.context/PBI/epics/EPIC-*/stories/STORY-*/test-cases.md` |

## Workflow Principle: JIRA-FIRST → LOCAL MIRROR

Both prompts follow this principle:

```
1. Analyze story/epic locally
         ↓
2. Update Jira FIRST (refinements, comments)
         ↓
3. Generate LOCAL file as MIRROR
         ↓
4. Git version control
```

This ensures:
- Single source of truth in Jira
- Team visibility via Jira comments
- Offline access via local files
- Version control via Git

## Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SHIFT-LEFT TESTING WORKFLOW                              │
└─────────────────────────────────────────────────────────────────────────────┘

         ┌─────────────────────────────────────────┐
         │  New Epic Ready for Refinement          │
         └────────────────┬────────────────────────┘
                          │
                          ▼
         ┌─────────────────────────────────────────┐
         │  1. feature-test-plan.md                │
         │     - Analyze epic business value       │
         │     - Identify technical risks          │
         │     - Define test strategy              │
         │     - Estimate test cases per story     │
         │     → Updates Jira epic + creates local  │
         └────────────────┬────────────────────────┘
                          │
                          ▼
         ┌─────────────────────────────────────────┐
         │  ⏸️ Wait for PO/Dev feedback           │
         │     - Answer critical questions         │
         │     - Clarify ambiguities               │
         └────────────────┬────────────────────────┘
                          │
                          ▼
         ┌─────────────────────────────────────────┐
         │  2. story-test-cases.md (per story)     │
         │     - Critical analysis                 │
         │     - Refine acceptance criteria        │
         │     - Design test cases                 │
         │     - Identify edge cases               │
         │     → Updates Jira story + creates local │
         └────────────────┬────────────────────────┘
                          │
                          ▼
         ┌─────────────────────────────────────────┐
         │  ⏸️ Wait for PO/Dev feedback           │
         │     - Validate refined criteria         │
         │     - Answer technical questions        │
         └────────────────┬────────────────────────┘
                          │
                          ▼
         ┌─────────────────────────────────────────┐
         │  ✅ Ready for Sprint                   │
         │     - All questions answered            │
         │     - Test cases reviewed               │
         │     - Dev starts implementation         │
         └─────────────────────────────────────────┘
```

## Prerequisites

Before running these prompts:

- [ ] Context files complete (`.context/idea/`, `.context/PRD/`, `.context/SRS/`)
- [ ] Epic and stories exist locally (`.context/PBI/epics/`)
- [ ] Epic and stories exist in Jira
- [ ] Atlassian MCP configured and working
- [ ] `epic.md` and `story.md` contain `**Jira Key:**` field

## Key Concepts

### Epic-Level Analysis

The `feature-test-plan.md` prompt:
- Analyzes business value and user impact
- Maps technical architecture and integration points
- Identifies risks (technical, business, integration)
- Defines test strategy and scope
- Estimates test coverage per story

### Story-Level Analysis

The `story-test-cases.md` prompt:
- Inherits context from epic test plan
- Performs critical analysis of acceptance criteria
- Identifies ambiguities and gaps
- Designs detailed test cases
- Creates working branch for version control

### Critical Questions

Both prompts generate questions for PO/Dev that MUST be answered before implementation:

| Question Type | Target | Purpose |
|--------------|--------|---------|
| Business | PO | Clarify expected behavior, edge cases |
| Technical | Dev | Clarify implementation approach |
| Risk | Both | Validate risk mitigation strategies |

**⚠️ BLOCKER:** Implementation should NOT start until critical questions are resolved.

## Jira Integration

### Labels Added

| Label | When Added | Meaning |
|-------|------------|---------|
| `test-plan-ready` | Epic analyzed | Epic has test strategy |
| `shift-left-reviewed` | Story analyzed | Story has test cases |

### Comment Structure

Test plans and test cases are added as comments in Jira with:
- Complete analysis content
- Action items for PO/Dev/QA
- Team member mentions (@PO, @Dev, @QA)
- Link to local documentation

## Git Branch Convention

Story test cases create a working branch:

```
test/{JIRA_KEY}/{short-description}
```

Examples:
- `test/UPEX-45/user-login-flow`
- `test/UPEX-123/checkout-validation`

Rules:
- Always branch from `staging`
- Only contains documentation changes
- Follows conventional commits

## When to Re-run

| Situation | Action |
|-----------|--------|
| Epic scope changes significantly | Re-run `feature-test-plan.md` |
| Story acceptance criteria change | Re-run `story-test-cases.md` |
| New stories added to epic | Run `story-test-cases.md` for new stories |
| Questions answered | Update local files to match Jira |

## Output Files Location

```
.context/PBI/epics/
└── EPIC-UPEX-13-feature-name/
    ├── epic.md                    # Epic description
    ├── feature-test-plan.md       # Test plan for epic (Stage 1)
    └── stories/
        └── STORY-UPEX-45-login/
            ├── story.md           # Story description
            └── test-cases.md      # Test cases for story (Stage 1)
```

## Integration with Other Stages

After Shift-Left is complete and implementation begins:

- **Stage 2 (Exploratory)**: Execute exploratory testing sessions
- **Stage 3 (Documentation)**: Update test documentation based on findings
- **Stage 4 (Automation)**: Automate test cases using Playwright

---

**Related**: [Context Generators](../context-generators/) | [Stage 2 - Exploratory](../stage-2-exploratory/)
