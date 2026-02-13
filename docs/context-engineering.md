# Context Engineering Strategy

> **Purpose**: Explain the context engineering strategy for AI-driven test automation.
> **Audience**: Humans learning the system + AI when needing to understand "why".
> **Related**: `CLAUDE.md` contains the operational context loaded each session.

---

## 1. What is Context Engineering?

**Context Engineering** is the practice of structuring information so AI assistants can work effectively on a codebase. Instead of the AI reading everything (expensive, slow), we provide curated context based on the task.

### Core Principles

| Principle | Description |
|-----------|-------------|
| **Token Efficiency** | Load only what's needed for the current task |
| **Progressive Loading** | Start with summary, load details on demand |
| **Context Relevance** | Different tasks need different context |
| **Single Source of Truth** | One place for each type of information |

---

## 2. Repository Philosophy

This repository separates concerns into distinct directories, each with a specific purpose:

```
ai-driven-test-automation-boilerplate/
│
├── .context/       → Documentation THAT the AI reads (context)
├── .prompts/       → Instructions FOR the AI to execute tasks
├── docs/           → Documentation for humans
├── tests/          → KATA framework implementation
└── CLAUDE.md       → Project memory (loaded every session)
```

### Why This Separation?

| Directory | Contains | When Loaded |
|-----------|----------|-------------|
| `.context/` | Facts about the system (what exists, how it works) | When AI needs to understand the system |
| `.prompts/` | Task instructions (what to do, step by step) | When AI needs to perform a specific task |
| `docs/` | Learning material for humans | When humans need to learn |
| `CLAUDE.md` | Operational rules + project state | Every session automatically |

---

## 3. Directory Structure

### .context/ - AI Context

```
.context/
├── guidelines/           → Rules and patterns for development
│   ├── TAE/             → Test Automation Engineering (KATA framework)
│   ├── QA/              → Manual testing guidelines
│   └── MCP/             → MCP integration guides
│
├── PRD/                 → Product Requirements (generated)
├── SRS/                 → Software Requirements (generated)
├── idea/                → Business context (generated)
├── PBI/                 → Backlog items (generated)
│
├── business-data-map.md    → System flows (generated)
├── api-architecture.md     → API documentation (generated)
└── project-test-guide.md   → Testing guide (generated)
```

**Key Files (Fixed Names)**:
- `guidelines/TAE/kata-ai-index.md` - Entry point for test automation
- `guidelines/MCP/README.md` - MCP decision tree

### .prompts/ - AI Operations Center

```
.prompts/
├── discovery/           → One-time project setup (phases 1-4)
│   ├── phase-1-constitution/
│   ├── phase-2-architecture/
│   ├── phase-3-infrastructure/
│   └── phase-4-specification/
│
├── stage-1-shift-left/  → Test planning (per story)
├── stage-2-exploratory/ → Manual testing (per story)
├── stage-3-documentation/ → TMS documentation (per story)
├── stage-4-automation/  → Test automation (per story)
├── stage-5-regression/  → Regression testing (per release)
│
├── utilities/           → Helpers + context generators
└── us-qa-workflow.md    → QA workflow orchestrator
```

**Key Files (Fixed Names)**:
- `us-qa-workflow.md` - Orchestrates the entire QA workflow
- `utilities/context-engineering-setup.md` - Generates README.md + CLAUDE.md

### docs/ - Human Documentation

```
docs/
├── architectures/       → Target application architecture
├── methodology/         → Testing methodology (IQL, KATA phases)
├── setup/               → Setup guides (MCP, tools)
├── testing/             → Testing guides (API, DB, automation)
├── workflows/           → Workflow guides (git, environments)
└── context-engineering.md → This file
```

### tests/ - KATA Implementation

```
tests/
├── components/          → KATA components (Layers 1-4)
│   ├── TestContext.ts   → Layer 1: Config, Faker, utilities
│   ├── api/             → Layers 2-3: ApiBase + domain APIs
│   ├── ui/              → Layers 2-3: UiBase + domain pages
│   ├── flows/           → Reusable ATC chains
│   └── TestFixture.ts   → Layer 4: Dependency injection
│
├── e2e/                 → E2E tests (UI + API)
├── integration/         → Integration tests (API only)
├── data/                → Test data (fixtures, uploads)
└── utils/               → Decorators, reporters
```

---

## 4. Key Files (Stable Names)

These files have stable names and locations. Reference them confidently:

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project memory, loaded every session |
| `.context/guidelines/TAE/kata-ai-index.md` | Entry point for writing tests |
| `.context/guidelines/MCP/README.md` | MCP decision tree |
| `.prompts/us-qa-workflow.md` | QA workflow orchestrator |
| `.prompts/utilities/context-engineering-setup.md` | Generate project documentation |

---

## 5. Workflow Overview

### One-Time Setup (Discovery)

```
Phase 1: Constitution    → Understand the business
Phase 2: Architecture    → Document PRD + SRS
Phase 3: Infrastructure  → Map technical stack
Phase 4: Specification   → Connect to backlog
```

**Output**: Populated `.context/` directories

### Context Generators

After discovery, generate operational context:

```
.prompts/utilities/business-data-map.md    → .context/business-data-map.md
.prompts/utilities/api-architecture.md     → .context/api-architecture.md
.prompts/utilities/project-test-guide.md   → .context/project-test-guide.md
```

### QA Stages (Per User Story)

```
Stage 1: Shift-Left     → Plan tests BEFORE development
Stage 2: Exploratory    → Manual validation BEFORE automation
Stage 3: Documentation  → Document tests in TMS
Stage 4: Automation     → Write automated tests
Stage 5: Regression     → Execute and report
```

---

## 6. Progressive Loading Strategy

### By Task Type

| Task | Load First | Load If Needed |
|------|------------|----------------|
| **Write E2E Test** | `kata-ai-index.md` | `e2e-testing-patterns.md` |
| **Write API Test** | `kata-ai-index.md` | `api-testing-patterns.md` |
| **Exploratory Testing** | `project-test-guide.md` | MCP guides |
| **Understand System** | `business-data-map.md` | `PRD/*`, `SRS/*` |
| **Use MCP** | `MCP/README.md` | Specific MCP guide |

### By Role

| Role | Primary Context |
|------|-----------------|
| **TAE (Test Automation)** | `guidelines/TAE/*` |
| **QA (Manual Testing)** | `guidelines/QA/*` + `stage-2-exploratory/*` |
| **DevOps** | `ci-cd-integration.md` + `stage-5-regression/*` |

---

## 7. Token Optimization Tips

### DO

- Load `CLAUDE.md` first (automatic)
- Load task-specific guidelines
- Use prompts from `.prompts/` for structured tasks
- Reference code in `tests/components/` as living examples

### DON'T

- Load all guidelines at once
- Include full file trees in prompts
- Duplicate information across files
- Load PRD/SRS for simple test writing

---

## 8. Maintenance Guidelines

### When to Update CLAUDE.md

- Project identity changes
- New MCPs configured
- New CLI tools added
- Testing decisions documented

### When to Update Guidelines

- Framework patterns change
- New conventions adopted
- Best practices refined

### When to Update Prompts

- Workflow steps change
- New outputs required
- Better instructions discovered

---

## Related Documentation

- **CLAUDE.md** - Operational context (project root)
- **README.md** - Project overview for humans
- `.context/guidelines/TAE/kata-ai-index.md` - KATA framework entry point
- `.prompts/README.md` - How to use prompts

---

**Last Updated**: 2026-02-12
