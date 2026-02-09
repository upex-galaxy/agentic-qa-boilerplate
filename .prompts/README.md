# AI PROMPTS - Test Automation Boilerplate

This directory contains optimized prompts for QA and Test Automation using the KATA framework.

---

## QUICK START

### For Existing Projects (Onboarding)

```
1. Run Discovery (discovery/):
   Phase 1 - Constitution:
   - project-connection.md    → Connect to the project
   - project-assessment.md    → Evaluate current state
   - business-model-discovery.md → Discover business model
   - domain-glossary.md       → Extract terminology

   Phase 2-4 - Architecture + Infrastructure + Backlog:
   - Run relevant prompts as needed

2. Run Context Generators (context-generators/):
   - business-data-map.md     → Map flows and data
   - api-architecture.md      → Document APIs
   - project-test-guide.md    → Testing guide

3. Continue with QA Stages (stage-1 through stage-5)
```

### For User Story QA

```
1. Is KATA framework configured? → utilities/kata-framework-setup.md
2. Is system documented? → context-generators/business-data-map.md + api-architecture.md
3. Run: us-qa-workflow.md (orchestrates all QA stages)
```

---

## DIRECTORY STRUCTURE

```
.prompts/
├── README.md                       # This file
│
├── discovery/                      # PROJECT DISCOVERY (one-time setup)
│   ├── phase-1-constitution/       # Project onboarding
│   ├── phase-2-architecture/       # PRD + SRS discovery
│   ├── phase-3-infrastructure/     # Technical infrastructure
│   └── phase-4-specification/      # Backlog mapping
│
├── context-generators/             # CONTEXT FILE GENERATORS
│   ├── business-data-map.md        # System flow documentation
│   ├── api-architecture.md         # API documentation
│   └── project-test-guide.md       # Testing guide
│
├── stage-1-shift-left/             # SHIFT-LEFT TESTING (per story)
├── stage-2-exploratory/            # EXPLORATORY TESTING (per story)
├── stage-3-documentation/          # TEST DOCUMENTATION (per story)
├── stage-4-automation/             # TEST AUTOMATION (per story)
├── stage-5-shift-right/            # SHIFT-RIGHT / OPERATIONS
│
├── utilities/                      # UTILITY PROMPTS
│   ├── kata-framework-setup.md     # Setup KATA framework
│   ├── framework-doc-setup.md      # Generate README + CLAUDE.md
│   ├── git-flow.md                 # Git workflow guide
│   └── git-conflict-fix.md         # Resolve merge conflicts
│
└── us-qa-workflow.md               # Complete QA workflow orchestrator
```

---

## UTILITY PROMPTS

| Prompt                              | Purpose                            |
| ----------------------------------- | ---------------------------------- |
| `utilities/kata-framework-setup.md` | Initial KATA framework setup       |
| `utilities/framework-doc-setup.md`  | Generate README + update CLAUDE.md |
| `utilities/git-flow.md`             | Commits and branching guide        |
| `utilities/git-conflict-fix.md`     | Resolve merge conflicts            |
| `us-qa-workflow.md`                 | Complete QA workflow orchestrator  |

---

## CONTEXT GENERATORS

Prompts to understand and document existing systems. They generate files in `.context/`.

| Prompt                                     | Output                           | Description                                        |
| ------------------------------------------ | -------------------------------- | -------------------------------------------------- |
| `context-generators/business-data-map.md`  | `.context/business-data-map.md`  | Map of flows, entities, state machines             |
| `context-generators/api-architecture.md`   | `.context/api-architecture.md`   | API catalog, auth, testing guide                   |
| `context-generators/project-test-guide.md` | `.context/project-test-guide.md` | Guide of WHAT to test (requires business-data-map) |

**Dependency chain:**

```
business-data-map.md  ─────► Generates master system map
        │
        ├──► api-architecture.md  ─────► Documents APIs (references flows)
        │
        └──► project-test-guide.md ────► Testing guide (REQUIRES business-data-map)
```

---

## DISCOVERY PHASES

### Phase 1: Constitution (Entry Point)

Entry point for existing projects. Combines onboarding + business context.

| Prompt                                                       | Output                             | Description                |
| ------------------------------------------------------------ | ---------------------------------- | -------------------------- |
| `discovery/phase-1-constitution/project-connection.md`       | `.context/project-config.md`       | Connect repos, tools, envs |
| `discovery/phase-1-constitution/project-assessment.md`       | Updates `CLAUDE.md`                | Evaluate project state     |
| `discovery/phase-1-constitution/business-model-discovery.md` | `.context/idea/business-model.md`  | Discover business model    |
| `discovery/phase-1-constitution/domain-glossary.md`          | `.context/idea/domain-glossary.md` | Extract domain terminology |

### Phase 2: Architecture (PRD + SRS)

| Prompt                                                       | Output          |
| ------------------------------------------------------------ | --------------- |
| `discovery/phase-2-architecture/prd-executive-summary.md`    | `.context/PRD/` |
| `discovery/phase-2-architecture/prd-user-personas.md`        | `.context/PRD/` |
| `discovery/phase-2-architecture/prd-user-journeys.md`        | `.context/PRD/` |
| `discovery/phase-2-architecture/prd-feature-inventory.md`    | `.context/PRD/` |
| `discovery/phase-2-architecture/srs-architecture-specs.md`   | `.context/SRS/` |
| `discovery/phase-2-architecture/srs-api-contracts.md`        | `.context/SRS/` |
| `discovery/phase-2-architecture/srs-functional-specs.md`     | `.context/SRS/` |
| `discovery/phase-2-architecture/srs-non-functional-specs.md` | `.context/SRS/` |

### Phase 3: Infrastructure

| Prompt                                                       | Output                           |
| ------------------------------------------------------------ | -------------------------------- |
| `discovery/phase-3-infrastructure/backend-discovery.md`      | `.context/SRS/infrastructure.md` |
| `discovery/phase-3-infrastructure/frontend-discovery.md`     | `.context/SRS/infrastructure.md` |
| `discovery/phase-3-infrastructure/infrastructure-mapping.md` | `.context/SRS/infrastructure.md` |

### Phase 4: Specification (Backlog)

| Prompt                                                   | Output          |
| -------------------------------------------------------- | --------------- |
| `discovery/phase-4-specification/pbi-backlog-mapping.md` | `.context/PBI/` |
| `discovery/phase-4-specification/pbi-story-template.md`  | `.context/PBI/` |

---

## QA STAGES

### Stage 1: Shift-Left Testing

| Prompt                                    | Purpose                     |
| ----------------------------------------- | --------------------------- |
| `stage-1-shift-left/feature-test-plan.md` | Test planning for features  |
| `stage-1-shift-left/story-test-cases.md`  | Test cases for user stories |

### Stage 2: Exploratory Testing

| Prompt                                        | Purpose                      |
| --------------------------------------------- | ---------------------------- |
| `stage-2-exploratory/ui-exploration.md`       | UI exploratory testing       |
| `stage-2-exploratory/api-exploration.md`      | API exploratory testing      |
| `stage-2-exploratory/database-exploration.md` | Database exploratory testing |
| `stage-2-exploratory/smoke-test.md`           | Feature smoke test           |
| `stage-2-exploratory/bug-report.md`           | Report found bugs            |

### Stage 3: Test Documentation

| Prompt                                         | Purpose                         |
| ---------------------------------------------- | ------------------------------- |
| `stage-3-documentation/test-analysis.md`       | Analyze test coverage           |
| `stage-3-documentation/test-documentation.md`  | Document test cases in TMS      |
| `stage-3-documentation/test-prioritization.md` | Prioritize tests for automation |

### Stage 4: Test Automation

| Prompt                                         | Purpose                  |
| ---------------------------------------------- | ------------------------ |
| `stage-4-automation/automation-planning.md`    | Plan automation approach |
| `stage-4-automation/automation-e2e.md`         | Automate E2E tests (UI)  |
| `stage-4-automation/automation-integration.md` | Automate API tests       |
| `stage-4-automation/code-review.md`            | Review automation code   |

### Stage 5: Shift-Right Testing

| Prompt                                     | Purpose                    |
| ------------------------------------------ | -------------------------- |
| `stage-5-shift-right/ci-cd-integration.md` | CI/CD pipeline integration |
| `stage-5-shift-right/monitoring-setup.md`  | Configure monitoring       |
| `stage-5-shift-right/smoke-tests.md`       | Production smoke tests     |
| `stage-5-shift-right/incident-response.md` | Document incident response |

---

## COMPLETE FLOW

```
╔═══════════════════════════════════════════════════════════════════╗
║                    EXISTING PROJECT                               ║
╚═══════════════════════════════════════════════════════════════════╝
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────┐
│  DISCOVERY: PHASE 1 - CONSTITUTION (Entry Point)                  │
│  ┌─────────────────┐  ┌─────────────────┐                         │
│  │ project-        │  │ project-        │  → .context/project-    │
│  │ connection.md   │  │ assessment.md   │    config.md            │
│  └─────────────────┘  └─────────────────┘                         │
│  ┌─────────────────┐  ┌─────────────────┐                         │
│  │ business-model- │  │ domain-         │  → .context/idea/       │
│  │ discovery.md    │  │ glossary.md     │                         │
│  └─────────────────┘  └─────────────────┘                         │
└───────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────┐
│  DISCOVERY: PHASES 2-4 - ARCHITECTURE + INFRASTRUCTURE + BACKLOG  │
│  → .context/PRD/, .context/SRS/, .context/PBI/                    │
└───────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────┐
│  CONTEXT GENERATORS                                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │
│  │ business-       │─►│ api-            │  │ project-        │    │
│  │ data-map.md     │  │ architecture.md │  │ test-guide.md   │    │
│  └─────────────────┘  └─────────────────┘  └────────┬────────┘    │
│           │                                         │             │
│           └─────────────── REQUIRES ────────────────┘             │
└───────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────┐
│  QA STAGES (1-5) - Per User Story                                 │
│  Shift-Left → Exploratory → Documentation → Automation → Prod    │
└───────────────────────────────────────────────────────────────────┘
```

---

## KATA GUIDELINES

Before automating, read the documentation in:

```
.context/guidelines/TAE/
├── KATA-AI-GUIDE.md          # Quick AI orientation
├── automation-standards.md   # Rules and conventions
├── kata-architecture.md      # Layer structure
├── openapi-integration.md        # Configure API tests
├── test-data-management.md   # Test data management
├── tms-integration.md        # Jira/Xray integration
└── ci-cd-integration.md      # CI/CD pipelines
```

---

## TEMPLATE REPOSITORY

KATA framework core files are downloaded from:

```
https://github.com/upex-galaxy/ai-driven-test-automation-boilerplate
Branch: main
```
