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
agentic-qa-boilerplate/
│
├── .context/         → Documentation THAT the AI reads (context)
├── .claude/skills/   → Workflow skills (task instructions + references)
├── docs/             → Documentation for humans
├── tests/            → KATA Architecture implementation
└── CLAUDE.md         → Project memory (loaded every session)
```

### Why This Separation?

| Directory | Contains | When Loaded |
|-----------|----------|-------------|
| `.context/` | Facts about the system (what exists, how it works) | When AI needs to understand the system |
| `.claude/skills/` | Task instructions + references (what to do, step by step) | When AI loads a skill for a specific task |
| `docs/` | Learning material for humans | When humans need to learn |
| `CLAUDE.md` | Operational rules + project state | Every session automatically |

---

## 3. Directory Structure

### .context/ - AI Context

```
.context/
├── PRD/                 → Product Requirements (generated)
├── SRS/                 → Software Requirements (generated)
├── PRD/business/        → Business context (generated)
├── PBI/                 → Backlog items (generated)
│
├── mapping/                → Business maps (command-generated)
│   ├── business-data-map.md       → System flows            (/business-data-map)
│   ├── business-feature-map.md    → Feature catalog         (/business-feature-map)
│   └── business-api-map.md        → Auth + critical API     (/business-api-map)
└── master-test-plan.md     → Testing guide                   (/master-test-plan)
```

Workflow instructions and role-specific guidelines (TAE, QA, MCP usage) now live inside Claude Code skills under `.claude/skills/`.

### .claude/skills/ - AI Operations Center

```
.claude/skills/
├── project-discovery/     → One-time project setup (phases 1-4) + README/CLAUDE.md generation
├── sprint-testing/        → In-sprint QA (planning + execution + reporting, per ticket)
├── test-documentation/    → TMS documentation + test prioritization
├── test-automation/       → KATA test planning + coding + review
├── regression-testing/    → Regression execution + GO/NO-GO
├── playwright-cli/        → Browser automation helper
└── xray-cli/              → Xray TMS helper
```

**Key Skills**:
- `/test-automation` - KATA test writing pipeline
- `/sprint-testing` - End-to-end in-sprint QA
- `/project-discovery` - Generates README.md + CLAUDE.md + `.context/` artifacts

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
│   ├── steps/           → Reusable ATC chains
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

| File / Skill | Purpose |
|--------------|---------|
| `CLAUDE.md` | Project memory, loaded every session |
| `/test-automation` skill | Entry point for writing tests (KATA) |
| `/sprint-testing` skill | QA workflow orchestrator (plan + execute + report) |
| `/project-discovery` skill | Generate project documentation + `.context/` |

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

After discovery, generate operational context via the `/project-discovery` skill:

```
/business-data-map          → .context/mapping/business-data-map.md
/business-feature-map       → .context/mapping/business-feature-map.md
/business-api-map           → .context/mapping/business-api-map.md
/master-test-plan           → .context/master-test-plan.md
bun run api:sync            → api/schemas/ (TypeScript types from OpenAPI)
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
| **Exploratory Testing** | `master-test-plan.md` | MCP guides |
| **Understand System** | `business-data-map.md` | `PRD/*`, `SRS/*` |
| **Use MCP** | `MCP/README.md` | Specific MCP guide |

### By Role

| Role | Primary Skill(s) |
|------|------------------|
| **TAE (Test Automation)** | `/test-automation` |
| **QA (Manual Testing)** | `/sprint-testing` + `/test-documentation` |
| **DevOps** | `/regression-testing` |

---

## 7. Token Optimization Tips

### DO

- Load `CLAUDE.md` first (automatic)
- Load task-specific guidelines
- Use skills from `.claude/skills/` for structured tasks
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

### When to Update Skills

- Framework patterns or conventions change (update the relevant skill's `references/`)
- Workflow steps change (update the SKILL.md orchestration)
- New outputs required or better instructions discovered

---

## Related Documentation

- **CLAUDE.md** - Operational context (project root)
- **README.md** - Project overview for humans
- `/test-automation` skill - KATA Architecture entry point
- `.claude/skills/` - Workflow skills (each one self-describes via its SKILL.md)

---

**Last Updated**: 2026-02-12
