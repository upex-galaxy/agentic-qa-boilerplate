# .context/ - Context Engineering Directory

This directory contains all the documentation that the AI reads to work on the project.

## 📂 Structure

```
.context/
├── system-prompt.md    # System prompt to copy to claude.md/gemini.md
├── idea/               PHASE 1: Constitution (business)
├── PRD/                PHASE 2: Architecture - Product Requirements
├── SRS/                PHASE 2: Architecture - Software Requirements
├── PBI/                PHASES 4-6: Product Backlog (Specification, Testing, Planning)
└── guidelines/         PHASES 7-14: Reference material by ROLE
    ├── QA/             Quality Engineering Guidelines
    ├── TAE/            Test Automation Engineering
    └── MCP/            MCP Guidelines (atomized)
```

## 🚀 Getting Started

### System Prompt

Before starting, configure your AI:

1. Read `system-prompt.md`
2. Copy its content to your configuration file:
   - Claude Code: `.claude/claude.md`
   - Gemini CLI: `.gemini/gemini.md`
   - GitHub Copilot: `.github/copilot-instructions.md`
   - Cursor: `.cursor/rules`

### Project Phases

**Discovery Phases (one-time, synchronous):**

1. **PHASE 1**: Use `.prompts/discovery/phase-1-constitution/` → generates `idea/` (discovers business context)
2. **PHASE 2**: Use `.prompts/discovery/phase-2-architecture/` → generates `PRD/`, `SRS/` (discovers architecture)
3. **PHASE 3**: Use `.prompts/discovery/phase-3-infrastructure/` → complements `SRS/` (discovers infrastructure)
4. **PHASE 4**: Use `.prompts/discovery/phase-4-specification/` → generates `PBI/`

**QA Stages (iterative per user story):**

- **Stage 1**: Use `.prompts/stage-1-shift-left/` → test planning BEFORE implementation
- **Stage 2**: Use `.prompts/stage-2-exploratory/` → exploratory testing
- **Stage 3**: Use `.prompts/stage-3-documentation/` → test documentation
- **Stage 4**: Use `.prompts/stage-4-automation/` → test automation
- **Stage 5**: Use `.prompts/stage-5-shift-right/` → production monitoring

## 📖 Guidelines by Role

| Role          | Folder            | When to Read      |
| ------------- | ----------------- | ----------------- |
| QA Engineer   | `guidelines/QA/`  | Stages 2, 3       |
| QA Automation | `guidelines/TAE/` | Stage 4           |
| Any role      | `guidelines/MCP/` | When using MCPs   |

## 📖 References

- **System Prompt**: `system-prompt.md`
- **Prompt instructions**: `.prompts/README.md`

---

**Last Updated**: 2026-02-09
