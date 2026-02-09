# Context Generators

> **Purpose**: Generate `.context/` files that document the system for AI and human consumption.
> **When to use**: After initial discovery (Phase 1+) or anytime you need to update context.

## Overview

Context generators create comprehensive documentation files that help AI assistants (and humans) understand the project deeply. These files are meant to be:

- **Reusable**: Load them at the start of new AI sessions
- **Visual**: Heavy use of ASCII diagrams for easy comprehension
- **Maintained**: UPDATE mode allows keeping them current

## Prompts in This Folder

| Order | Prompt                  | Purpose                       | Output                           | Prerequisite          |
| ----- | ----------------------- | ----------------------------- | -------------------------------- | --------------------- |
| 1     | `business-data-map.md`  | Map business entities & flows | `.context/business-data-map.md`  | None                  |
| 2     | `api-architecture.md`   | Document all API endpoints    | `.context/api-architecture.md`   | None                  |
| 3     | `project-test-guide.md` | Guide on what to test         | `.context/project-test-guide.md` | business-data-map.md  |

## Recommended Execution Order

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CONTEXT GENERATION FLOW                                 │
└─────────────────────────────────────────────────────────────────────────────┘

         ┌─────────────────────────────────────────┐
         │  1. business-data-map.md                │
         │     - Entities and relationships        │
         │     - Business flows                    │
         │     - State machines                    │
         │     - Automatic processes               │
         │     → .context/business-data-map.md     │
         └────────────────┬────────────────────────┘
                         │
         ┌───────────────┴───────────────┐
         │                               │
         ▼                               ▼
┌─────────────────────────┐   ┌─────────────────────────┐
│ 2a. api-architecture.md │   │ 2b. project-test-guide  │
│     - All endpoints     │   │     - What to test      │
│     - Auth requirements │   │     - Edge cases        │
│     - Testing examples  │   │     - Priorities        │
│     → .context/api-...  │   │     → .context/test-... │
└─────────────────────────┘   └─────────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  CONTEXT COMPLETE   │
              │  Ready for QA work  │
              └─────────────────────┘
```

## Key Features

### CREATE vs UPDATE Mode

Each prompt automatically detects:

```
Does output file exist?
  → NO: CREATE mode (generate from scratch)
  → YES: UPDATE mode (show diff, ask for confirmation)
```

### Visual-First Approach

All generators produce ASCII diagrams:

```
┌─────────────────┐     ┌─────────────────┐
│    Entity A     │────►│    Entity B     │
└─────────────────┘     └─────────────────┘
```

### MCP Integration

Generators can leverage MCPs if available:

- **Database MCP**: Explore schema, relationships
- **GitHub MCP**: Read repository structure
- **Atlassian MCP**: Connect business to backlog

## When to Run

| Situation                     | Action                        |
| ----------------------------- | ----------------------------- |
| New project onboarding        | Run all 3 in order            |
| After major feature changes   | Re-run affected generators    |
| Before QA phase starts        | Verify context is current     |
| Starting new AI session       | Load existing context files   |

## Output Files

After running all generators, your `.context/` will include:

```
.context/
├── business-data-map.md    # System flows and entities
├── api-architecture.md     # API documentation
└── project-test-guide.md   # Testing orientation
```

## Integration with QA Stages

These context files are referenced by QA stage prompts:

- **Stage 1 (Shift-Left)**: Uses business-data-map for test planning
- **Stage 2 (Exploratory)**: Uses api-architecture for API testing
- **Stage 3 (Documentation)**: Uses all context for test docs
- **Stage 4 (Automation)**: Uses api-architecture for API tests

---

**Related**: [Discovery Phases](../discovery/) | [QA Stages](../stage-1-shift-left/)
