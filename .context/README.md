# .context/ - Context Engineering Directory

This directory contains all the documentation that the AI reads to work on the project.

## Structure

```
.context/
├── idea/               PHASE 1: Constitution (business)
├── PRD/                PHASE 2: Architecture - Product Requirements
├── SRS/                PHASE 2: Architecture - Software Requirements
├── PBI/                PHASES 4+: Product Backlog (Specification, Testing)
├── guidelines/         Reference material by ROLE
│   ├── QA/             Quality Engineering Guidelines
│   ├── TAE/            Test Automation Engineering
│   └── MCP/            MCP Guidelines
├── business-data-map.md    # Generated: System flows
├── api-architecture.md     # Generated: API documentation
└── project-test-guide.md   # Generated: Testing guide
```

## Getting Started

### Project Memory Setup

Configure your AI tool's project memory:

```bash
# Run this prompt to generate/update documentation
@.prompts/utilities/context-engineering-setup.md
```

This prompt will:
1. Detect your AI tool (Claude Code, Gemini CLI, Cursor, Copilot, etc.)
2. Generate the correct configuration file (`CLAUDE.md`, `GEMINI.md`, etc.)
3. Generate a professional `README.md`

### Project Phases

**Discovery Phases (one-time, synchronous):**

1. **PHASE 1**: Use `.prompts/discovery/phase-1-constitution/` → generates `idea/` (discovers business context)
2. **PHASE 2**: Use `.prompts/discovery/phase-2-architecture/` → generates `PRD/`, `SRS/` (discovers architecture)
3. **PHASE 3**: Use `.prompts/discovery/phase-3-infrastructure/` → complements `SRS/` (discovers infrastructure)
4. **PHASE 4**: Use `.prompts/discovery/phase-4-specification/` → generates `PBI/`

**QA Stages (iterative per user story):**

- **Stage 1**: Use `.prompts/stage-1-planning/` → test planning BEFORE implementation
- **Stage 2**: Use `.prompts/stage-2-execution/` → test execution (exploratory + smoke)
- **Stage 3**: Use `.prompts/stage-3-reporting/` → test reporting + bug reporting
- **Stage 4**: Use `.prompts/stage-4-documentation/` → test documentation + prioritization
- **Stage 5**: Use `.prompts/stage-5-automation/` → test automation (KATA)
- **Stage 6**: Use `.prompts/stage-6-regression/` → regression execution

## Guidelines by Role

| Role          | Folder            | When to Read      |
| ------------- | ----------------- | ----------------- |
| QA Engineer   | `guidelines/QA/`  | Stages 2, 3       |
| QA Automation | `guidelines/TAE/` | Stage 4           |
| Any role      | `guidelines/MCP/` | When using MCPs   |

## References

- **Project Memory**: `CLAUDE.md` (or equivalent for your AI tool)
- **Context Engineering**: `docs/context-engineering.md`
- **Prompt instructions**: `.prompts/README.md`

---

**Last Updated**: 2026-02-12
