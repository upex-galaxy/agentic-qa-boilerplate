# BIG PICTURE - Complete Repository Architecture

## Complete Visual Structure

```
ai-driven-test-automation-boilerplate/
│
├── .context/                              For: Context engineering documentation (AI reads this)
│   │
│   ├── README.md                          For: Master index, entry point
│   │
│   ├── idea/                              For: PHASE 1 - Business constitution
│   │   ├── README.md                      For: Explain Phase 1
│   │   ├── business-model.md              For: Business Model Canvas (9 blocks)
│   │   └── domain-glossary.md             For: Domain vocabulary and terms
│   │
│   ├── PRD/                               For: PHASE 2 - Product Requirements (business vision)
│   │   ├── README.md                      For: Explain what PRD is
│   │   ├── executive-summary.md           For: Problem statement + KPIs + target users
│   │   ├── user-personas.md               For: 2-3 detailed user profiles
│   │   ├── feature-inventory.md           For: Feature catalog
│   │   └── user-journeys.md               For: User flows (happy path + edge cases)
│   │
│   ├── SRS/                               For: PHASE 2-3 - Software Requirements (technical vision)
│   │   ├── README.md                      For: Explain what SRS is
│   │   ├── functional-specs.md            For: Functional requirements (FRs)
│   │   ├── non-functional-specs.md        For: Performance, security, scalability
│   │   ├── architecture-specs.md          For: C4 diagrams, ERD, tech stack
│   │   ├── api-contracts.md               For: API documentation
│   │   └── infrastructure.md              For: CI/CD, deployment, environments
│   │
│   ├── PBI/                               For: PHASE 4 - Product Backlog Items
│   │   └── README.md                      For: Backlog structure explanation
│   │
│   ├── business-data-map.md               For: Generated system flow documentation
│   ├── api-architecture.md                For: Generated API documentation
│   ├── project-test-guide.md              For: Generated testing guide
│   │
│   └── guidelines/                        For: Reference material for AI
│       ├── README.md                      For: Guidelines overview
│       │
│       ├── TAE/                           For: Test Automation Engineering
│       │   ├── README.md                  For: TAE overview
│       │   ├── KATA-AI-GUIDE.md           For: AI entry point for KATA
│       │   ├── kata-architecture.md       For: KATA framework architecture
│       │   ├── automation-standards.md    For: Test automation coding standards
│       │   ├── openapi-integration.md         For: API testing setup
│       │   ├── test-data-management.md    For: Test data strategies
│       │   ├── data-testid-usage.md       For: data-testid conventions
│       │   ├── ci-cd-integration.md       For: CI/CD pipeline integration
│       │   └── tms-integration.md         For: Test Management System integration
│       │
│       ├── QA/                            For: Quality Assurance
│       │   ├── README.md                  For: QA overview
│       │   ├── exploratory-testing.md     For: Exploratory testing guidelines
│       │   ├── spec-driven-testing.md     For: Specification-based testing
│       │   └── jira-test-management.md    For: Jira/Xray test management
│       │
│       └── MCP/                           For: MCP Server guides
│           ├── README.md                  For: MCP overview
│           ├── atlassian.md               For: Jira/Confluence integration
│           ├── context7.md                For: Research and documentation
│           ├── dbhub.md                   For: Database connection
│           ├── openapi.md                 For: API endpoints context
│           ├── playwright.md              For: Playwright MCP (UI testing)
│           ├── postman.md                 For: Postman MCP (API testing)
│           └── tavily.md                  For: Web research
│
├── .prompts/                              For: AI prompts to generate documentation
│   │
│   ├── README.md                          For: Instructions on using prompts
│   │
│   ├── discovery/                         For: PROJECT DISCOVERY (one-time setup)
│   │   ├── README.md                      For: Discovery overview
│   │   │
│   │   ├── phase-1-constitution/          For: Project onboarding
│   │   │   ├── project-connection.md      For: Connect to repos, tools, envs
│   │   │   ├── project-assessment.md      For: Evaluate project maturity
│   │   │   ├── business-model-discovery.md For: Understand business context
│   │   │   └── domain-glossary.md         For: Build domain vocabulary
│   │   │
│   │   ├── phase-2-architecture/          For: PRD + SRS discovery
│   │   │   ├── prd-executive-summary.md   For: Product overview prompt
│   │   │   ├── prd-user-personas.md       For: User personas prompt
│   │   │   ├── prd-user-journeys.md       For: User journeys prompt
│   │   │   ├── prd-feature-inventory.md   For: Feature catalog prompt
│   │   │   ├── srs-architecture-specs.md  For: Architecture + C4 prompt
│   │   │   ├── srs-api-contracts.md       For: API spec prompt
│   │   │   ├── srs-functional-specs.md    For: Functional requirements prompt
│   │   │   └── srs-non-functional-specs.md For: NFRs prompt
│   │   │
│   │   ├── phase-3-infrastructure/        For: Technical infrastructure
│   │   │   ├── backend-discovery.md       For: Backend stack analysis
│   │   │   ├── frontend-discovery.md      For: Frontend stack analysis
│   │   │   └── infrastructure-mapping.md  For: CI/CD, deployment mapping
│   │   │
│   │   └── phase-4-specification/         For: Backlog integration
│   │       ├── pbi-backlog-mapping.md     For: Map backlog location
│   │       └── pbi-story-template.md      For: Story templates
│   │
│   ├── context-generators/                For: CONTEXT FILE GENERATORS
│   │   ├── README.md                      For: How to use generators
│   │   ├── business-data-map.md           For: Generate business-data-map.md
│   │   ├── api-architecture.md            For: Generate api-architecture.md
│   │   └── project-test-guide.md          For: Generate project-test-guide.md
│   │
│   ├── stage-1-shift-left/                For: SHIFT-LEFT TESTING (per story)
│   │   ├── README.md                      For: Stage overview
│   │   ├── feature-test-plan.md           For: Feature test planning
│   │   └── story-test-cases.md            For: Story test case design
│   │
│   ├── stage-2-exploratory/               For: EXPLORATORY TESTING (per story)
│   │   ├── README.md                      For: Stage overview
│   │   ├── ui-exploration.md              For: UI exploratory testing (Playwright MCP)
│   │   ├── api-exploration.md             For: API exploratory testing (Postman MCP)
│   │   ├── database-exploration.md        For: DB exploratory testing (DBHub MCP)
│   │   ├── smoke-test.md                  For: Quick deployment validation
│   │   └── bug-report.md                  For: Defect documentation
│   │
│   ├── stage-3-documentation/             For: TEST DOCUMENTATION (per story)
│   │   ├── README.md                      For: Stage overview
│   │   ├── test-analysis.md               For: Test coverage analysis
│   │   ├── test-documentation.md          For: Document tests in TMS
│   │   └── test-prioritization.md         For: Prioritize for automation
│   │
│   ├── stage-4-automation/                For: TEST AUTOMATION (per story)
│   │   ├── README.md                      For: Stage overview
│   │   ├── automation-planning.md         For: Plan automation approach
│   │   ├── automation-e2e.md              For: Implement E2E tests
│   │   ├── automation-integration.md      For: Implement integration tests
│   │   └── code-review.md                 For: Review automation code
│   │
│   ├── stage-5-shift-right/               For: SHIFT-RIGHT / OPERATIONS
│   │   ├── README.md                      For: Stage overview
│   │   ├── ci-cd-integration.md           For: Pipeline integration
│   │   ├── monitoring-setup.md            For: Monitoring configuration
│   │   ├── smoke-tests.md                 For: Production smoke tests
│   │   └── incident-response.md           For: Incident handling
│   │
│   ├── utilities/                         For: UTILITY PROMPTS
│   │   ├── README.md                      For: Utilities overview
│   │   ├── kata-framework-setup.md        For: KATA framework setup
│   │   ├── framework-doc-setup.md         For: Generate README + CLAUDE.md
│   │   ├── git-flow.md                    For: Git workflow assistance
│   │   └── git-conflict-fix.md            For: Git conflict resolution
│   │
│   └── us-qa-workflow.md                  For: Complete QA workflow orchestrator
│
├── docs/                                  For: Human learning documentation
│   ├── README.md                          For: Documentation index
│   │
│   ├── mcp/                               For: MCP setup guides
│   │   ├── README.md                      For: MCP general guide
│   │   ├── builder-strategy.md            For: Token optimization strategy
│   │   ├── claude-code.md                 For: Claude Code configuration
│   │   ├── gemini-cli.md                  For: Gemini CLI configuration
│   │   ├── copilot-cli.md                 For: GitHub Copilot CLI
│   │   └── vscode.md                      For: VS Code integration
│   │
│   ├── testing/                           For: Testing guides
│   │   ├── api-guide/                     For: API testing documentation
│   │   ├── database-guide/                For: Database testing documentation
│   │   └── test-architecture/             For: KATA architecture documentation
│   │
│   └── workflows/                         For: Workflow guides
│       ├── git-flow-guide.md              For: Git workflow documentation
│       ├── environments.md                For: Environment configuration
│       └── ...
│
├── tests/                                 For: KATA Framework implementation
│   ├── components/                        For: KATA Components
│   │   ├── TestContext.ts                 For: Layer 1 - Base utilities
│   │   ├── TestFixture.ts                 For: Layer 4 - Unified fixture
│   │   ├── ApiFixture.ts                  For: Layer 4 - API container
│   │   ├── UiFixture.ts                   For: Layer 4 - UI container
│   │   ├── api/                           For: API components (Layer 2-3)
│   │   ├── ui/                            For: UI components (Layer 2-3)
│   │   └── preconditions/                 For: Reusable setup flows
│   │
│   ├── e2e/                               For: E2E tests (browser + API)
│   ├── integration/                       For: Integration tests (API only)
│   ├── data/                              For: Test data (fixtures, uploads)
│   └── utils/                             For: Decorators, reporters, TMS sync
│
├── CLAUDE.md                              For: AI context memory
├── README.md                              For: Project documentation
└── playwright.config.ts                   For: Playwright configuration
```

---

## COMPLETE WORKFLOW

### **DISCOVERY PHASES** (One-time setup for existing projects)

#### Phase 1: Constitution (Project Onboarding)

```
Input: Access to existing project
Use: .prompts/discovery/phase-1-constitution/
Output: .context/idea/ (business-model.md, domain-glossary.md)
Who: QA Lead, TAE Lead, anyone onboarding
```

#### Phase 2: Architecture (PRD + SRS Discovery)

```
Input: .context/idea/ + project codebase
Use: .prompts/discovery/phase-2-architecture/
Output:
  - .context/PRD/ (executive-summary, user-personas, feature-inventory, user-journeys)
  - .context/SRS/ (functional-specs, non-functional-specs, architecture-specs, api-contracts)
Who: QA Analyst, Solution Architect
```

#### Phase 3: Infrastructure (Technical Discovery)

```
Input: .context/PRD/ + .context/SRS/ + project codebase
Use: .prompts/discovery/phase-3-infrastructure/
Output: .context/SRS/infrastructure.md
Who: TAE, DevOps
```

#### Phase 4: Specification (Backlog Mapping)

```
Input: Project backlog (Jira, GitHub Issues, etc.)
Use: .prompts/discovery/phase-4-specification/
Output: .context/PBI/
Who: QA Lead, Product Owner
```

### **CONTEXT GENERATORS** (Run after Discovery)

```
Input: Discovery outputs + project codebase
Use: .prompts/context-generators/
Output:
  - .context/business-data-map.md (system flows)
  - .context/api-architecture.md (API documentation)
  - .context/project-test-guide.md (testing guide)
Who: QA Lead, TAE Lead
```

---

### **QA STAGES** (Iterative - per user story/sprint)

#### Stage 1: Shift-Left Testing (QA)

```
Input: User Story (from backlog)
Use: .prompts/stage-1-shift-left/
Output: Feature test plan + story test cases
Who: QA Engineer, Test Lead
Purpose: Plan tests BEFORE implementation
```

#### Stage 2: Exploratory Testing (QA)

```
Input: Deployed feature (staging environment)
Use: .prompts/stage-2-exploratory/
Output: Exploration findings + bug reports
Who: QA Engineer
Purpose: Manual validation before automation

MCPs Used:
- ui-exploration.md → Playwright MCP
- api-exploration.md → Postman MCP, OpenAPI MCP
- database-exploration.md → DBHub MCP
```

#### Stage 3: Test Documentation (QA)

```
Input: Exploratory findings
Use: .prompts/stage-3-documentation/
Output: Test cases documented in TMS (Jira/Xray)
Who: QA Engineer
Purpose: Document what to test and why
```

#### Stage 4: Test Automation (TAE)

```
Input: Documented test cases
Use: .prompts/stage-4-automation/
Output: Automated E2E + Integration tests
Who: QA Automation Engineer, SDET
Purpose: Automate validated scenarios

KATA Framework Architecture:
- Layer 1: TestContext (utilities, faker)
- Layer 2: Base classes (ApiBase, UiBase)
- Layer 3: Domain components (with ATCs)
- Layer 4: Fixtures (dependency injection)
```

#### Stage 5: Shift-Right Testing (TAE/DevOps)

```
Input: Automated tests + production environment
Use: .prompts/stage-5-shift-right/
Output: CI/CD integration + monitoring + incident playbooks
Who: TAE, SRE, DevOps
Purpose: Continuous testing in production
```

---

## KEY CONCEPTS

### Documentation vs Prompts

| Type              | Location    | Purpose                             |
| ----------------- | ----------- | ----------------------------------- |
| **Documentation** | `.context/` | Information that AI reads to work   |
| **Prompts**       | `.prompts/` | Templates to GENERATE documentation |
| **Guides**        | `docs/`     | Human learning documentation        |

### Roles by Stage

| Stage         | Name           | Type      | Role        | Input                | Output                   |
| ------------- | -------------- | --------- | ----------- | -------------------- | ------------------------ |
| **DISCOVERY** |                |           |             |                      |                          |
| Phase 1       | Constitution   | One-time  | QA Lead     | Project access       | `.context/idea/`         |
| Phase 2       | Architecture   | One-time  | QA Analyst  | idea + codebase      | `.context/PRD/` + `SRS/` |
| Phase 3       | Infrastructure | One-time  | TAE         | PRD + SRS + codebase | `.context/SRS/infra`     |
| Phase 4       | Specification  | One-time  | QA Lead     | Project backlog      | `.context/PBI/`          |
| **QA STAGES** |                |           |             |                      |                          |
| Stage 1       | Shift-Left     | Iterative | QA Engineer | User Story           | Test plans + cases       |
| Stage 2       | Exploratory    | Iterative | QA Engineer | Staging deploy       | Findings + bugs          |
| Stage 3       | Documentation  | Iterative | QA Engineer | Exploratory findings | Tests in TMS             |
| Stage 4       | Automation     | Iterative | TAE/SDET    | Documented tests     | Automated tests          |
| Stage 5       | Shift-Right    | Iterative | TAE/DevOps  | Automated tests      | CI/CD + monitoring       |

### Testing: Manual Before Automated

**Exploratory (Stage 2) before Automation (Stage 4):**

| Aspect      | Exploratory     | Automation |
| ----------- | --------------- | ---------- |
| Speed       | 5-30 minutes    | Hours/days |
| Coverage    | UX + logic bugs | Logic only |
| Investment  | Low             | High       |
| Flexibility | Total           | Rigid      |

**Principle:** Only automate what has been validated manually.

**Reason:** Don't waste time automating broken functionality or features that will change.

### KATA Framework Architecture

**KATA** = Komponent Action Test Architecture

Organizes tests in 4 layers:

```
┌─────────────────────────────────────────┐
│         Test Files (.test.ts)           │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│       Layer 4: Fixtures (DI)            │
│   TestFixture → api + ui containers     │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│    Layer 3: Domain Components           │
│   ExampleApi, ExamplePage (with ATCs)   │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│      Layer 2: Base Classes              │
│      ApiBase, UiBase (utilities)        │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│      Layer 1: Test Context              │
│   Config, Faker, Utilities              │
└─────────────────────────────────────────┘
```

---

## STATISTICS

### Total Files Created

| Directory              | Files       | Purpose                          |
| ---------------------- | ----------- | -------------------------------- |
| `.context/idea/`       | 2-3         | Phase 1: Constitution            |
| `.context/PRD/`        | 4           | Phase 2: Architecture (business) |
| `.context/SRS/`        | 5           | Phase 2-3: Architecture (tech)   |
| `.context/PBI/`        | Variable    | Phase 4: Specification           |
| `.context/guidelines/` | ~25         | Reference material               |
| `.prompts/`            | ~40         | Prompt templates                 |
| `docs/`                | ~20         | Human documentation              |
| `tests/`               | Variable    | KATA framework implementation    |
| **TOTAL BASE**         | **~90-100** | Complete system                  |

---

## KEY POINTS TO REMEMBER

### DO's

1. **Follow sequential order** for Discovery (phases 1-4), then iterate on QA Stages (1-5)
2. **Use prompts** from `.prompts/` to generate docs in `.context/`
3. **Discovery BEFORE QA Stages** - Understand the system before testing
4. **Exploratory BEFORE Automation** - Manual (Stage 2) before automating (Stage 4)
5. **Read guidelines** before implementing tests
6. **Use MCP tools** (Playwright, Postman, DBHub) for real exploration
7. **Maintain traceability** between test cases and requirements
8. **Use KATA architecture** for all automated tests

### DON'Ts

1. **DON'T skip** Discovery phases (context is essential)
2. **DON'T automate** before manual validation
3. **DON'T duplicate** information (DRY always)
4. **DON'T mix** prompts with documentation
5. **DON'T create** unnecessary files
6. **DON'T skip** smoke tests after deployment
7. **DON'T ignore** the layer architecture in KATA

---

## NEXT STEPS

1. **For new projects**: Start with `.prompts/discovery/phase-1-constitution/`
2. **Run Context Generators**: After Discovery, run all 3 generators
3. **For each User Story**: Follow QA Stages 1-5 iteratively
4. **Setup KATA Framework**: Use `utilities/kata-framework-setup.md`
5. **Integrate with CI/CD**: Use `stage-5-shift-right/ci-cd-integration.md`

---

## CODE QUALITY TOOLS

This template includes pre-configured code quality tools:

### Included Tools

| Tool             | Purpose                          | Configuration      |
| ---------------- | -------------------------------- | ------------------ |
| **Prettier**     | Automatic code formatting        | `.prettierrc`      |
| **ESLint**       | Linting and error detection      | `eslint.config.js` |
| **Husky**        | Automated git hooks              | `.husky/`          |
| **lint-staged**  | Run linters only on staged files | `package.json`     |
| **EditorConfig** | Style consistency across editors | `.editorconfig`    |

### Available Scripts

```bash
# Formatting
bun run format          # Format all files
bun run format:check    # Check format without modifying

# Linting
bun run lint            # Run ESLint
bun run lint:fix        # Run ESLint with auto-fix
```

### Pre-commit Hook

The pre-commit hook automatically runs:

1. **ESLint** with auto-fix on `.ts`, `.tsx`, `.js`, `.jsx` files
2. **Prettier** on modified files

This ensures all committed code meets project standards.

---

**This system is your "second brain" for AI-driven test automation. Each file has a specific purpose in the complete QA workflow.**

---

**Version 4.0** - Restructured for QA/Test Automation focus
**Last updated:** 2026-01-29
