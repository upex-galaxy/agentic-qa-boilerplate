# Setup Prompts

> **Purpose**: One-time prompts for initial project configuration.
> **When to use**: After cloning template, before starting QA workflow.

---

## Overview

Setup prompts are executed once when adapting this template to a real project. Unlike utility prompts (which are reusable), these configure the fundamental infrastructure that enables all subsequent testing.

## Available Prompts

| Prompt | Purpose | Output |
|--------|---------|--------|
| `kata-architecture-adaptation.md` | Adapt KATA template to your project | `.context/PBI/kata-architecture-adaptation-plan.md` |

---

## KATA Architecture Adaptation

### What It Does

This prompt transforms the generic KATA template into a project-specific test automation framework by:

1. **Reading Project Context**: All discovery outputs (SRS, PRD, idea, API architecture)
2. **Analyzing Current Template**: Understanding the test structure
3. **Generating Adaptation Plan**: Detailed plan with authentication strategy, components to create
4. **Implementing (on approval)**: Modifying files, creating components, configuring auth

### Two-Phase Workflow

```
PHASE 1: ANALYSIS + PLAN
├── Read context (.context/SRS, PRD, idea)
├── Read KATA guidelines (TAE/)
├── Analyze template (tests/)
├── Ask questions (if info missing)
└── OUTPUT: .context/PBI/kata-architecture-adaptation-plan.md

PHASE 2: IMPLEMENTATION (user approval required)
├── Read approved plan
├── Configure authentication (globalSetup, UI, API)
├── Create domain components
├── Update fixtures
└── OUTPUT: Working MVP framework
```

### Prerequisites

Before running this prompt, ensure:

1. **Discovery Completed**: Run all discovery phases (1-4)
2. **Context Generated**: At minimum:
   - `.context/idea/business-model.md`
   - `.context/SRS/` (any files)
   - Understanding of the target application

### Critical Outputs

The adaptation ensures:

- **Global Setup**: Session preparation and directories
- **UI Authentication**: Browser login with storageState
- **API Authentication**: Token-based auth for integration tests
- **First Domain Components**: At least one API and one UI component
- **Updated Fixtures**: DI configuration for new components

---

## Usage Flow

```
1. Clone this template repository
   └─ Use GitHub "Use this template" or fork

2. Run Discovery (phases 1-4)
   └─ Generates .context/ with project information

3. Run kata-architecture-adaptation.md
   └─ Generates adaptation plan
   └─ Waits for your approval
   └─ Implements on confirmation

4. Run context-engineering-setup.md
   └─ Updates README.md and CLAUDE.md

5. Verify setup
   └─ bun run type-check
   └─ bun run lint
   └─ bun run test --grep @smoke

6. Start QA workflow
   └─ @.prompts/us-qa-workflow.md
```

---

## Related

- **Discovery**: `.prompts/discovery/` - Generate project context
- **Utilities**: `.prompts/utilities/` - Reusable helper prompts
- **QA Workflow**: `.prompts/us-qa-workflow.md` - Main QA orchestrator

---

**Last Updated**: 2026-02-13
