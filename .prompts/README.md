# AI PROMPTS - Test Automation Boilerplate

This directory contains optimized prompts for QA and Test Automation using the KATA framework.

---

## QUICK START

### For New Projects (Template Adaptation)

```
1. Clone this template repository
   └─ Use GitHub "Use this template" or fork

2. Run Discovery (discovery/):
   Phase 1 - Constitution:
   - project-connection.md      → Connect to the project
   - business-model-discovery.md → Discover business model
   - domain-glossary.md         → Extract terminology

   Phase 2-4 - Architecture + Infrastructure + Backlog:
   - Run relevant prompts as needed

3. Run Context Generators (discovery/):
   - business-data-map.md       → Map flows and data
   - api-architecture.md        → Document APIs

4. Adapt Framework (setup/):
   - kata-framework-adaptation.md → Configure KATA for your project

5. Generate Documentation (utilities/):
   - context-engineering-setup.md → Generate README + CLAUDE.md
   - project-test-guide.md        → Testing guide

6. Start QA Workflow:
   - us-qa-workflow.md (orchestrates all QA stages)
```

### For User Story QA

```
1. Is KATA framework adapted? → setup/kata-framework-adaptation.md
2. Is system documented? → discovery/business-data-map.md + api-architecture.md
3. Run: us-qa-workflow.md (orchestrates all QA stages)
```

---

## DIRECTORY STRUCTURE

```
.prompts/
├── README.md                       # This file
├── session-start.md                # SESSION ENTRY POINT (per ticket)
├── us-qa-workflow.md               # Complete QA workflow orchestrator
├── bug-qa-workflow.md              # Bug retesting workflow
│
├── discovery/                      # PROJECT DISCOVERY (one-time)
│   ├── phase-1-constitution/       # Project onboarding
│   ├── phase-2-architecture/       # PRD + SRS discovery
│   ├── phase-3-infrastructure/     # Technical infrastructure
│   ├── phase-4-specification/      # Backlog mapping
│   ├── api-architecture.md         # API documentation (context generator)
│   └── business-data-map.md        # Business flow mapping (context generator)
│
├── setup/                          # ONE-TIME SETUP
│   └── kata-framework-adaptation.md # Adapt KATA template to project
│
├── utilities/                      # REUSABLE UTILITIES
│   ├── context-engineering-setup.md # Generate README + CLAUDE.md
│   ├── project-test-guide.md       # Testing guide
│   ├── traceability-fix.md         # Fix TMS traceability links
│   ├── git-flow.md                 # Git workflow guide
│   └── git-conflict-fix.md         # Resolve merge conflicts
│
├── stage-1-planning/               # TEST PLANNING (per story)
├── stage-2-execution/              # EXPLORATORY TESTING (per story)
├── stage-3-reporting/              # TEST REPORTING (per story)
├── stage-4-documentation/          # TEST DOCUMENTATION (per story)
├── stage-5-automation/             # TEST AUTOMATION (per story)
├── stage-6-regression/             # REGRESSION TESTING (per release)
│
└── us-qa-workflow.md               # Complete QA workflow orchestrator
```

---

## SETUP PROMPTS

One-time prompts for initial project configuration.

| Prompt | Purpose |
|--------|---------|
| `setup/kata-framework-adaptation.md` | Adapt KATA template to your specific project |

---

## UTILITY PROMPTS

Reusable prompts for common tasks.

| Prompt | Purpose |
|--------|---------|
| `utilities/context-engineering-setup.md` | Generate README + update CLAUDE.md |
| `utilities/project-test-guide.md` | Generate testing guide |
| `utilities/traceability-fix.md` | Fix TMS traceability links |
| `utilities/git-flow.md` | Commits and branching guide |
| `utilities/git-conflict-fix.md` | Resolve merge conflicts |
| `session-start.md` | Initialize testing session (entry point) |
| `us-qa-workflow.md` | Complete QA workflow orchestrator |
| `bug-qa-workflow.md` | Bug retesting workflow |

---

## TEMPLATES (Copy-Paste)

Templates are NOT terminal prompts. They are copy-paste documents that you adapt and paste into a chat session.

| Template | Purpose | Location |
|----------|---------|----------|
| `sprint-testing-prompt.md` | Sprint testing orchestration (multi-ticket) | `templates/` |

**Usage**: Copy the content between the `--- START COPY ---` and `--- END COPY ---` markers, edit the session notes, and paste into your chat.

---

## CONTEXT GENERATORS

Prompts to understand and document existing systems. They generate files in `.context/`.

| Prompt | Output | Description |
|--------|--------|-------------|
| `discovery/business-data-map.md` | `.context/business-data-map.md` | Map of flows, entities, state machines |
| `discovery/api-architecture.md` | `.context/api-architecture.md` | API catalog, auth, testing guide |
| `utilities/project-test-guide.md` | `.context/project-test-guide.md` | Guide of WHAT to test |

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

| Prompt | Output | Description |
|--------|--------|-------------|
| `discovery/phase-1-constitution/project-connection.md` | `.context/project-config.md` | Connect repos, tools, envs |
| `discovery/phase-1-constitution/project-assessment.md` | Updates `CLAUDE.md` | Evaluate project state |
| `discovery/phase-1-constitution/business-model-discovery.md` | `.context/idea/business-model.md` | Discover business model |
| `discovery/phase-1-constitution/domain-glossary.md` | `.context/idea/domain-glossary.md` | Extract domain terminology |

### Phase 2: Architecture (PRD + SRS)

| Prompt | Output |
|--------|--------|
| `discovery/phase-2-architecture/prd-user-personas.md` | `.context/PRD/` |
| `discovery/phase-2-architecture/prd-feature-inventory.md` | `.context/PRD/` |
| `discovery/phase-2-architecture/srs-api-contracts.md` | `.context/SRS/` |
| `discovery/phase-2-architecture/srs-non-functional-specs.md` | `.context/SRS/` |

### Phase 3: Infrastructure

| Prompt | Output |
|--------|--------|
| `discovery/phase-3-infrastructure/backend-discovery.md` | `.context/SRS/infrastructure.md` |
| `discovery/phase-3-infrastructure/frontend-discovery.md` | `.context/SRS/infrastructure.md` |
| `discovery/phase-3-infrastructure/infrastructure-mapping.md` | `.context/SRS/infrastructure.md` |

### Phase 4: Specification (Backlog)

| Prompt | Output |
|--------|--------|
| `discovery/phase-4-specification/pbi-backlog-mapping.md` | `.context/PBI/` |
| `discovery/phase-4-specification/pbi-story-template.md` | `.context/PBI/` |

---

## QA STAGES

### Stage 1: Planning

Test planning and design BEFORE development.

| Prompt | Purpose |
|--------|---------|
| `stage-1-planning/README.md` | Stage overview |
| `stage-1-planning/feature-test-plan.md` | Test planning for features/epics |
| `stage-1-planning/acceptance-test-plan.md` | Acceptance Test Plan (ATP) per story |

### Stage 2: Execution

Manual exploratory testing with Triforce approach (UI, API, DB).

| Prompt | Purpose |
|--------|---------|
| `stage-2-execution/README.md` | Stage overview + Triforce |
| `stage-2-execution/smoke-test.md` | Quick deployment validation |
| `stage-2-execution/ui-exploration.md` | UI testing with Playwright MCP |
| `stage-2-execution/api-exploration.md` | API testing with Postman MCP |
| `stage-2-execution/db-exploration.md` | DB testing with DBHub MCP |

### Stage 3: Reporting

Fill ATR test report, summarize results, and document bugs.

| Prompt | Purpose |
|--------|---------|
| `stage-3-reporting/README.md` | Stage overview |
| `stage-3-reporting/test-report.md` | Fill ATR, summarize results, complete workflow |
| `stage-3-reporting/bug-report.md` | Document and report bugs |

### Stage 4: Test Documentation

Document tests in TMS with ROI-based prioritization.

| Prompt | Purpose |
|--------|---------|
| `stage-4-documentation/README.md` | Stage overview + ATC workflow |
| `stage-4-documentation/test-analysis.md` | Analyze US and identify tests |
| `stage-4-documentation/test-prioritization.md` | ROI-based test prioritization |
| `stage-4-documentation/test-documentation.md` | Create tests in Jira/Xray |

### Stage 5: Test Automation

Automate prioritized test cases following KATA architecture. Uses 3-phase workflow.

| Prompt | Phase | Purpose |
|--------|-------|---------|
| `stage-5-automation/README.md` | - | Stage overview + workflow diagram |
| `stage-5-automation/planning/test-implementation-plan.md` | 1 | Plan E2E or API test implementation |
| `stage-5-automation/planning/atc-implementation-plan.md` | 1 | Plan ATC spec implementation |
| `stage-5-automation/coding/e2e-test-coding.md` | 2 | Implement UI component + test |
| `stage-5-automation/coding/integration-test-coding.md` | 2 | Implement API component + test |
| `stage-5-automation/review/e2e-test-review.md` | 3 | KATA compliance review |
| `stage-5-automation/review/integration-test-review.md` | 3 | API code quality review |

### Stage 6: Regression Testing

Execute automated tests, analyze results, and generate quality reports.

| Prompt | Phase | Purpose |
|--------|-------|---------|
| `stage-6-regression/README.md` | - | Stage overview + `gh` CLI reference |
| `stage-6-regression/regression-execution.md` | 1 | Trigger and monitor test execution |
| `stage-6-regression/regression-analysis.md` | 2 | Analyze results and classify failures |
| `stage-6-regression/regression-report.md` | 3 | Generate GO/NO-GO quality report |

---

## TC WORKFLOW STATUS

| Status | Description | Next Step |
|--------|-------------|-----------|
| **Draft** | TC identified during analysis | Refine with preconditions + steps |
| **Ready** | TC fully specified in TMS | Prioritize for automation |
| **Candidate** | Prioritized for automation (ROI approved) | Create implementation plan |
| **Manual** | Deferred from automation (low ROI) | Keep as manual regression |
| **In Automation** | Implementation in progress | Complete + review |
| **In Review** | Code review / KATA compliance check | Merge or fix |
| **Automated** | Merged and running in CI | Monitor in regression |

---

## TMS ARTIFACTS & TRACEABILITY

### Artifact Model

Each User Story produces a chain of traceable artifacts:

```
User Story (Jira)
    ↓
ATP (Acceptance Test Plan)        ← Stage 1
    ↓
ATR (Acceptance Test Report)      ← Stage 3
    ↓
TCs (Test Cases in TMS)           ← Stage 4
    ↓
ATCs (Automated Test Cases)       ← Stage 5
    ↓
Regression Results                ← Stage 6
```

### Naming Conventions

| Artifact | Format | Example |
|----------|--------|---------|
| **ATP** | `Acceptance Test Plan: STORY-XXX` | `Acceptance Test Plan: MYM-123` |
| **ATR** | `Acceptance Test Report: STORY-XXX` | `Acceptance Test Report: MYM-123` |
| **TC** | `Validate <CORE> <CONDITIONAL>` | `Validate login with valid credentials` |
| **ATC** | `@atc('TICKET-ID')` | `@atc('MYM-456')` |

### Verification

When traceability breaks (missing links, orphan TCs), use:
- **Fix utility:** `.prompts/utilities/traceability-fix.md`

---

## CLI QUICK REFERENCE

| Command | Purpose |
|---------|---------|
| `bun run test` | Run all tests |
| `bun run test:e2e` | Run E2E tests only |
| `bun run test:integration` | Run API tests only |
| `bun run test:smoke` | Run @critical tagged tests |
| `bun run test:ui` | Visual UI mode |
| `bun run test:allure` | Generate Allure report |
| `bun xray --help` | Xray TMS CLI (sync tests) |
| `bun run api:sync` | Sync OpenAPI spec + generate types |
| `bun run kata:manifest` | Extract ATCs from codebase |

---

## COMPLETE FLOW

```
╔═══════════════════════════════════════════════════════════════════╗
║                    CLONE TEMPLATE                                  ║
╚═══════════════════════════════════════════════════════════════════╝
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────┐
│  DISCOVERY: PHASE 1 - CONSTITUTION (Entry Point)                  │
│  ┌─────────────────┐  ┌─────────────────┐                         │
│  │ project-        │  │ business-model- │  → .context/idea/       │
│  │ connection.md   │  │ discovery.md    │                         │
│  └─────────────────┘  └─────────────────┘                         │
│  ┌─────────────────┐                                              │
│  │ domain-         │  → .context/idea/domain-glossary.md          │
│  │ glossary.md     │                                              │
│  └─────────────────┘                                              │
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
│  CONTEXT GENERATORS (discovery/)                                  │
│  ┌─────────────────┐  ┌─────────────────┐                         │
│  │ business-       │  │ api-            │                         │
│  │ data-map.md     │  │ architecture.md │                         │
│  └─────────────────┘  └─────────────────┘                         │
│           │                                                       │
│           └──► .context/business-data-map.md                      │
│                .context/api-architecture.md                       │
└───────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────┐
│  SETUP: KATA FRAMEWORK ADAPTATION                                 │
│  ┌─────────────────────────────────────────┐                      │
│  │ setup/kata-framework-adaptation.md      │                      │
│  │ • Reads all context (SRS, PRD, idea)    │                      │
│  │ • Generates adaptation plan              │                      │
│  │ • Configures auth (global, UI, API)     │                      │
│  │ • Creates first domain components       │                      │
│  └─────────────────────────────────────────┘                      │
│  OUTPUT: .context/PBI/kata-framework-adaptation-plan.md           │
└───────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────┐
│  DOCUMENTATION SETUP (utilities/)                                 │
│  ┌─────────────────┐  ┌─────────────────┐                         │
│  │ context-        │  │ project-test-   │                         │
│  │ engineering-    │  │ guide.md        │                         │
│  │ setup.md        │  │                 │                         │
│  └─────────────────┘  └─────────────────┘                         │
│  OUTPUT: README.md, CLAUDE.md, .context/project-test-guide.md     │
└───────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────┐
│  QA STAGES (1-6) - Per User Story                                 │
│                                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ Stage 1  │─►│ Stage 2  │─►│ Stage 3  │─►│ Stage 4  │          │
│  │ Planning │  │ Execu-   │  │ Report-  │  │ Document │          │
│  │          │  │ tion     │  │ ing      │  │ ation    │          │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘          │
│                                                  │                │
│                              ┌────────────────────┘                │
│                              ▼                                    │
│                  ┌──────────┐   ┌──────────┐                      │
│                  │ Stage 5  │──►│ Stage 6  │                      │
│                  │ Automate │   │ Regres-  │                      │
│                  │          │   │ sion     │                      │
│                  └──────────┘   └──────────┘                      │
│                                      │                            │
│                     ◄──── Feedback Loop ────┘                     │
└───────────────────────────────────────────────────────────────────┘
```

---

## KATA GUIDELINES

Before automating, read the documentation in:

```
.context/guidelines/TAE/
├── kata-ai-index.md          # Quick AI orientation
├── automation-standards.md   # Rules and conventions
├── kata-architecture.md      # Layer structure
├── playwright-automation-system.md # DI and session reuse
├── openapi-integration.md    # Configure API tests
├── test-data-management.md   # Test data management
├── tms-integration.md        # Jira/Xray integration
└── ci-cd-integration.md      # CI/CD pipelines
```

---

## TEMPLATE REPOSITORY

This repository is the KATA framework template:

```
https://github.com/upex-galaxy/ai-driven-test-automation-boilerplate
Branch: main
```

Use the `setup/kata-framework-adaptation.md` prompt to adapt it to your project.

---

**Last Updated**: 2026-04-01
