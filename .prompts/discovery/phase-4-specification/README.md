# Phase 4: Specification (Backlog Strategy)

> **Purpose**: Establish backlog management strategy and integrate with existing PM tools.
> **Adaptation**: Original prompts CREATE backlog items. These MAP existing backlog and create integration strategy.

## Overview

Phase 4 connects the discovered context to the actual work management:

- Where is the backlog managed? (Jira, Azure DevOps, etc.)
- How to access stories for testing?
- What's the template for new work items?

**IMPORTANT PRINCIPLE**: Don't duplicate backlog locally. Document WHERE it lives and HOW to access it.

## Prompts in This Phase

| Order | Prompt                   | Purpose                          | Output                    |
| ----- | ------------------------ | -------------------------------- | ------------------------- |
| 1     | `pbi-backlog-mapping.md` | Map backlog location and access  | `.context/PBI/README.md`  |
| 2     | `pbi-story-template.md`  | Create templates for new stories | `.context/PBI/templates/` |

## Prerequisites

- [ ] Phases 1-3 completed
- [ ] Knowledge of where backlog is managed
- [ ] (Optional) Jira/Azure DevOps MCP configured
- [ ] (Optional) Access to PM tool via CLI

## Key Principle: Don't Duplicate Backlog

```
❌ WRONG: Copy all Jira stories to local markdown files
✅ RIGHT: Document how to ACCESS Jira stories when needed
```

**Why?**

- Backlog changes constantly
- Duplication causes sync issues
- Single source of truth is better
- MCPs can fetch live data

## What Goes in .context/PBI/

| Content                | When to Create        | Example                               |
| ---------------------- | --------------------- | ------------------------------------- |
| README.md              | Always                | Backlog location, access instructions |
| Templates              | Always                | Story/bug/task templates              |
| Current sprint stories | During active testing | Stories being tested NOW              |
| Test artifacts         | During testing        | Test cases for specific stories       |

## Execution Flow

```
┌─────────────────────────────────────────────────────────────┐
│              Phase 3 Complete                                │
│              Infrastructure documented                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  1. pbi-backlog-mapping.md                                   │
│     - Identify backlog tool (Jira, Azure, etc.)              │
│     - Document access method (MCP, CLI, API)                 │
│     - Map project/board structure                            │
│     → Creates: .context/PBI/README.md                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  2. pbi-story-template.md                                    │
│     - Create story template                                  │
│     - Create bug template                                    │
│     - Define acceptance criteria format                      │
│     → Creates: .context/PBI/templates/                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│           DISCOVERY PHASES COMPLETE (0-4)                    │
│           Ready for QA phases (5+)                           │
└─────────────────────────────────────────────────────────────┘
```

## Integration with QA Phases

After Phase 4, the QA phases (5, 10-14) will:

1. **Phase 5 (Shift-Left Testing)**: Create test cases FOR specific stories
   - Fetch story from Jira via MCP
   - Create test plan in `.context/PBI/[story-id]/`
   - Link back to Jira

2. **Phase 10-12 (Testing)**: Execute tests
   - Reference stories by ID
   - Update status in Jira
   - Attach test artifacts

## Jira Integration (Priority)

Since Jira is the priority PM tool, here's the recommended setup:

### With Atlassian MCP

```
1. Configure Atlassian MCP
2. Query project: Use Atlassian MCP functions
3. Get stories: jira issue list --project=X --type=Story
4. Get single story: jira issue view PROJ-123
```

### Without MCP (CLI Fallback)

```bash
# Using jira-cli if installed
jira issue list -p PROJECT -t Story
jira issue view PROJ-123

# Using curl
curl -u email:token https://your-domain.atlassian.net/rest/api/3/issue/PROJ-123
```

---

**Previous Phase**: [Phase 3 - Infrastructure](.prompts/discovery/phase-3-infrastructure/README.md)
**Next Phase**: [Phase 5 - Shift-Left Testing](.prompts/stage-1-shift-left/README.md)
