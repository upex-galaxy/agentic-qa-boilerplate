# Agentic QA Boilerplate

> Skills-based AI workflows for the full QA lifecycle, built on Playwright + KATA + TypeScript.

[![Playwright Tests](https://img.shields.io/badge/Playwright-1.50+-green?logo=playwright)](https://playwright.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-black?logo=bun)](https://bun.sh/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Why This Boilerplate?

This boilerplate solves common challenges in test automation:

- **AI-Ready**: Context engineering system that enables AI assistants to write tests effectively
- **Scalable Architecture**: KATA pattern separates concerns and promotes reusability
- **TMS Integration**: Built-in sync with Jira/Xray for test management
- **CI/CD Ready**: Pre-configured GitHub Actions workflows for all test types
- **Type-Safe**: Full TypeScript with strict mode enabled

---

## Features

| Feature | Description |
|---------|-------------|
| **KATA Architecture** | Component Action Test Architecture for clean test organization |
| **Playwright** | Modern browser automation with auto-waiting and tracing |
| **Allure Reports** | Rich test reports with history and trends |
| **TMS Sync** | Automatic sync of test results to Jira/Xray |
| **Context Engineering** | `.context/` directory with AI-friendly documentation |
| **Skills-based Workflows** | Agent skills under `.claude/skills/` drive the AI-assisted QA and automation flows |
| **MCP Integration** | Ready for Playwright, Database, and API MCPs |

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- Node.js 18+ (for some Playwright features)

### Installation

```bash
# Clone the repository
git clone https://github.com/upex-galaxy/agentic-qa-boilerplate.git
cd agentic-qa-boilerplate

# Install dependencies
bun install

# Install Playwright browsers
bun run pw:install

# Copy environment variables
cp .env.example .env
```

### Configuration

Edit `.env` with your project values:

```bash
# Environment selector
TEST_ENV=staging

# Test User Credentials
STAGING_USER_EMAIL=your-test-user@example.com
STAGING_USER_PASSWORD=your-password

# TMS Integration (Jira/Xray)
XRAY_CLIENT_ID=your-client-id
XRAY_CLIENT_SECRET=your-client-secret

# Browser Configuration
HEADLESS=true
DEFAULT_TIMEOUT=30000
```

Update `config/variables.ts` with your application URLs:

```typescript
const urlMap: Record<Environment, { base: string; api: string }> = {
  local: {
    base: 'http://localhost:3000',
    api: 'http://localhost:3000/api',
  },
  staging: {
    base: 'https://staging.yourapp.com',
    api: 'https://staging.yourapp.com/api',
  },
  production: {
    base: 'https://app.yourapp.com',
    api: 'https://api.yourapp.com',
  },
};
```

### Run Tests

```bash
# Run all tests
bun run test

# Run with UI mode (recommended for development)
bun run test:ui

# Run specific test types
bun run test:e2e           # E2E tests only
bun run test:integration   # API tests only
bun run test:e2e:critical  # Tests marked @critical
```

---

## Project Structure

```
├── tests/
│   ├── components/               # KATA Components Layer
│   │   ├── TestContext.ts        # Layer 1: Base utilities + faker
│   │   ├── TestFixture.ts        # Layer 4: Unified test fixture
│   │   ├── api/                  # API components
│   │   │   ├── ApiBase.ts        # Layer 2: HTTP client base
│   │   │   └── ExampleApi.ts     # Layer 3: Domain component
│   │   ├── ui/                   # UI components
│   │   │   ├── UiBase.ts         # Layer 2: Page base
│   │   │   └── ExamplePage.ts    # Layer 3: Domain component
│   │   └── flows/                # Reusable setup flows
│   │
│   ├── e2e/                      # E2E test specs
│   │   └── module-example/       # Example module
│   ├── integration/              # API integration tests
│   │   └── module-example/       # Example module
│   ├── setup/                    # Test setup files
│   │   ├── global.setup.ts       # Global setup
│   │   └── ui-auth.setup.ts      # UI authentication
│   ├── data/
│   │   ├── fixtures/             # Static test data (JSON)
│   │   ├── types.ts              # Test data types
│   │   └── DataFactory.ts        # Dynamic data generation
│   └── utils/                    # Test utilities
│       ├── decorators.ts         # @atc decorator
│       ├── jiraSync.ts           # TMS synchronization
│       └── KataReporter.ts       # Terminal reporter
│
├── config/
│   ├── variables.ts              # Environment configuration
│   └── validateEnv.ts            # Environment validation
│
├── .context/                     # AI Context Engineering
│   ├── PRD/                      # Product requirements (generated)
│   ├── SRS/                      # Technical specs (generated)
│   ├── PRD/business/             # Business context (generated)
│   └── PBI/                      # Backlog items (generated)
│
├── .claude/skills/               # Claude Code Skills (workflows)
│   ├── project-discovery/        # Onboarding + context generation
│   ├── sprint-testing/           # Planning + execution + reporting
│   ├── test-documentation/       # TMS documentation + prioritization
│   ├── test-automation/          # KATA planning + coding + review
│   ├── regression-testing/       # Regression execution + GO/NO-GO
│   ├── playwright-cli/           # Browser automation helper
│   └── xray-cli/                 # Xray TMS helper
│
├── .github/workflows/            # CI/CD pipelines
│   ├── build.yml                 # PR validation
│   ├── smoke.yml                 # Daily smoke tests
│   ├── sanity.yml                # Pattern-based tests
│   └── regression.yml            # Full regression
│
├── docs/                         # Documentation
│   └── testing/                  # Testing documentation
│
├── playwright.config.ts          # Playwright configuration
├── CLAUDE.md                     # AI context memory (customize)
└── package.json                  # Scripts and dependencies
```

---

## KATA Architecture

This boilerplate implements **KATA** (Component Action Test Architecture).

### Architecture Layers

```
TestContext (Layer 1)
    ↓ extends
UiBase / ApiBase (Layer 2) ← Helpers here
    ↓ extends
YourPage / YourApi (Layer 3) ← ATCs here
    ↓ used by
TestFixture (Layer 4) ← DI entry point
    ↓ used by
Test Files ← Orchestrate ATCs
```

### Component Types

| Component | Purpose | Location |
|-----------|---------|----------|
| **Api** | HTTP interactions | `tests/components/api/` |
| **Page** | UI interactions | `tests/components/ui/` |
| **Flow** | Reusable setup flows | `tests/components/flows/` |

### Example Test

```typescript
import { test, expect } from '@TestFixture';

test.describe('User Dashboard', () => {
  test('@atc:UPEX-101 should display user profile', async ({ dashboardPage }) => {
    await dashboardPage.navigateToDashboard();
    await dashboardPage.openUserProfile();

    await expect(dashboardPage.profileCard).toBeVisible();
    await expect(dashboardPage.userName).toContainText('John');
  });
});
```

See the `/test-automation` skill (`references/kata-ai-index.md`) for complete documentation.

---

## Available Scripts

### Test Execution

| Script | Description |
|--------|-------------|
| `bun run test` | Run all tests |
| `bun run test:ui` | Open Playwright UI mode |
| `bun run test:debug` | Run with debugger |
| `bun run test:headed` | Run with browser visible |
| `bun run test:e2e` | Run E2E tests only |
| `bun run test:integration` | Run API tests only |
| `bun run test:e2e:critical` | Run @critical tests |
| `bun run test:retries` | Run with 2 retries |
| `bun run test:last-failed` | Re-run failed tests |

### Reports

| Script | Description |
|--------|-------------|
| `bun run test:report` | Open Playwright report |
| `bun run test:allure` | Generate and open Allure |
| `bun run test:allure:generate` | Generate Allure only |
| `bun run test:allure:open` | Open existing Allure |
| `bun run test:sync` | Sync results to TMS |

### Code Quality

| Script | Description |
|--------|-------------|
| `bun run lint` | Run ESLint |
| `bun run lint:fix` | Fix linting issues |
| `bun run format` | Format with Prettier |
| `bun run type-check` | TypeScript check |

### Utilities

| Script | Description |
|--------|-------------|
| `bun run pw:install` | Install browsers |
| `bun run env:validate` | Validate environment |
| `bun run clean` | Remove test artifacts |

### CLI Tools

| Script | Description |
|--------|-------------|
| `bun run update` | Sync project with template (skills, docs) |
| `bun run xray` | Xray CLI for test management |
| `bun run resend` | Email verification CLI (Resend API) |
| `bun run api:sync` | Sync OpenAPI spec and generate types |

---

## CI/CD Pipelines

### GitHub Actions Workflows

| Workflow | Trigger | Description |
|----------|---------|-------------|
| `build.yml` | PR to main | Validate framework compiles |
| `smoke.yml` | Daily 2AM UTC | Run @critical tests |
| `sanity.yml` | Manual | Run tests by grep pattern |
| `regression.yml` | Daily midnight | Full test suite |

### Environment Secrets Required

```yaml
# Test Credentials
LOCAL_USER_EMAIL
LOCAL_USER_PASSWORD
STAGING_USER_EMAIL
STAGING_USER_PASSWORD

# TMS (Optional)
XRAY_CLIENT_ID
XRAY_CLIENT_SECRET
AUTO_SYNC
```

---

## AI-Assisted Development

This boilerplate's AI-assisted workflows are delivered as **agent skills** following the [agentskills.io](https://agentskills.io) spec. Every skill lives under `.claude/skills/` and bundles its own instructions, `references/`, and progressive-disclosure assets, so the AI loads only what the current task needs.

Structured project context (`.context/` with `PRD/`, `SRS/`, `PBI/`) is generated and maintained by these skills -- you do not hand-author it.

### Complete Adaptation Flow

When you clone this template, follow this flow to adapt it to your project:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. CLONE TEMPLATE                                           │
│    git clone https://github.com/upex-galaxy/               │
│      agentic-qa-boilerplate.git my-tests                   │
│    bun install && bun run pw:install                       │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. RUN DISCOVERY + ADAPT KATA FRAMEWORK                     │
│    Load the /project-discovery skill                        │
│                                                             │
│    This skill:                                              │
│    • Discovers business/architecture/infrastructure context│
│    • Generates .context/ (PRD/, SRS/)                      │
│    • Generates business-data-map / api-architecture /      │
│      master-test-plan                                     │
│    • Adapts KATA to your stack                             │
│    • Regenerates README.md and CLAUDE.md                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. VERIFY SETUP                                             │
│    bun run type-check                                       │
│    bun run lint                                             │
│    bun run test --grep @smoke                               │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. START QA WORKFLOW                                        │
│    Load the /sprint-testing skill for in-sprint QA         │
│    Load the /test-automation skill to write tests          │
└─────────────────────────────────────────────────────────────┘
```

### Skills (Workflow Entry Points)

```
.claude/skills/
├── project-discovery/     # Onboarding, context generation, KATA adaptation
├── sprint-testing/        # In-sprint QA: plan + execute + report (per ticket)
├── test-documentation/    # TMS documentation and test prioritization
├── test-automation/       # KATA planning + coding + review pipeline
├── regression-testing/    # Regression execution + GO/NO-GO decisions
├── playwright-cli/        # Browser automation helper (screenshots, tracing, ...)
└── xray-cli/              # Xray TMS helper (tests, executions, imports, ...)

.agents/skills/            # Symlink to .claude/skills/ (agentskills.io path)
```

### How to Use Each Skill

Each skill auto-activates when your prompt matches its description triggers. You can also invoke a skill explicitly in Claude Code by typing its slash trigger (e.g. `/sprint-testing`). The sample prompts below are plain user utterances -- type them into the agent terminal as-is.

#### 1. Onboarding a new project

- **Situation**: You just cloned the boilerplate against a new target app and need `.context/`, CLAUDE.md, and KATA adapted to the real stack.
- **Skill**: `/project-discovery`
- **Sample prompts**:
  - "Adapt this repo to my new backend stack at `../my-backend`."
  - "Generate the `.context/` files for this project."
  - "Onboard this boilerplate to the app in `../my-frontend`."
- **What happens next**: The skill discovers business/architecture/infrastructure context, generates `.context/` (`PRD/`, `SRS/`, `mapping/business-data-map.md`, `mapping/business-feature-map.md`, `mapping/business-api-map.md`, `master-test-plan.md`), adapts KATA to your stack, and refreshes CLAUDE.md.

#### 2. Running an in-sprint QA loop

- **Situation**: You have one or more sprint tickets (user stories or bug fixes) that need manual QA before release.
- **Skill**: `/sprint-testing`
- **Sample prompts**:
  - "Test the user story UPEX-123."
  - "Verify the fix for bug UPEX-456."
  - "Run QA on this sprint's tickets."
- **What happens next**: The skill orchestrates Stages 1 (Planning), 2 (Execution), and 3 (Reporting) per ticket, creates the `.context/PBI/` folder, and produces an ATP and ATR for each ticket.

#### 3. Documenting tests in Jira/Xray

- **Situation**: You need to turn manual test cases into TMS artifacts and decide which ones deserve automation.
- **Skill**: `/test-documentation`
- **Sample prompts**:
  - "Document test cases for ticket UPEX-200 in Xray."
  - "Score these tests by ROI to decide automation priority."
  - "Create the ATP for UPEX-300 in Xray and link it to the story."
- **What happens next**: The skill creates Test / ATP / ATR entities in Xray following the project's naming conventions and prioritizes candidates using an ROI rubric.

#### 4. Writing automated tests

- **Situation**: You have approved test specs and need E2E or API tests implemented on KATA + Playwright.
- **Skill**: `/test-automation`
- **Sample prompts**:
  - "Automate the ATCs from UPEX-100."
  - "Write an E2E test for the login flow."
  - "Review this integration test."
- **What happens next**: The skill runs the Plan -> Code -> Review pipeline: proposes an implementation plan, writes KATA-compliant tests, and reviews them against the project's automation standards.

#### 5. Running regression and the release decision

- **Situation**: Release candidate ready; you need the full regression executed and a GO/NO-GO call.
- **Skill**: `/regression-testing`
- **Sample prompts**:
  - "Run the full regression and give me a GO/NO-GO."
  - "Analyze the failures in the latest smoke run."
  - "Trigger the regression workflow on staging and summarize the results."
- **What happens next**: The skill kicks off the CI workflow (or local run), classifies failures (product bug / flake / environment), and produces a release-decision report.

#### 6. Browser automation helper

- **Situation**: You need quick Playwright-powered actions inside a session -- screenshots, traces, video, request mocking.
- **Skill**: `/playwright-cli`
- **Sample prompts**:
  - "Take a screenshot of the login page."
  - "Record a Playwright trace of this flow."
  - "Mock the `/api/users` response and reload."
- **What happens next**: The skill drives a Playwright browser session with the right flags for screenshots, tracing, video, storage state, or request interception.

#### 7. Xray API operations

- **Situation**: You need to talk to Xray Cloud directly (create artifacts, import results, back up a project).
- **Skill**: `/xray-cli`
- **Sample prompts**:
  - "Create a new test in Xray for UPEX-100."
  - "Import JUnit results to Xray."
  - "Back up project UPEX."
- **What happens next**: The skill maps your request to the `bun xray` CLI commands (tests, executions, plans, imports, backup/restore) and runs them with the project-specific conventions.

### How Skills Activate

- **Description-matching**: Skills auto-activate when your prompt matches the triggers declared in each skill's `description` frontmatter. You normally do not need to name the skill.
- **Explicit slash trigger** (Claude Code only): You can force-load a skill by typing `/skill-name` (e.g. `/sprint-testing`).
- **Other agents** (Codex, Cursor, Copilot, OpenCode): Slash commands are not available, but the same `description` triggers cause the skills to auto-activate from natural prompts -- the portability path is the `.agents/skills/` symlink.

### CLAUDE.md

The `CLAUDE.md` file serves as AI memory. Customize it for your project:

1. Update project identity
2. Document critical test priorities
3. Track context files
4. Log decisions and progress

### Multi-Agent Portability

Skills follow the [agentskills.io](https://agentskills.io) spec, so they are portable across Claude Code, Codex, GitHub Copilot, Cursor, and OpenCode. A relative symlink exposes the canonical Claude Code location at the shared agentskills path, avoiding duplicated files.

| Platform | Directory |
|----------|-----------|
| Claude Code | `.claude/skills/` (canonical) |
| Codex / Copilot / Cursor / OpenCode | `.agents/skills/` (symlink -> `.claude/skills/`) |

The `.agents/skills/` symlink keeps a single source of truth while exposing the agentskills.io standard path. You do not need to maintain both.

**Portability constraints** (features that degrade gracefully outside Claude Code):

- Slash commands (`/skill-name`) are Claude Code specific. In other agents, skills auto-activate from the `description` triggers -- prompt the agent in plain language and the right skill loads.
- Sub-agent dispatch used by the batch modes of `/sprint-testing` and `/test-automation` falls back to sequential execution in agents that lack a sub-agent primitive; throughput is lower but the flow still completes.
- Everything else -- frontmatter, `references/`, progressive disclosure, pseudocode tags (`[ISSUE_TRACKER_TOOL]`, `[TMS_TOOL]`, `[AUTOMATION_TOOL]`, ...) -- is fully portable. For how these tags resolve to concrete tools (and why `[ISSUE_TRACKER_TOOL]` -> `/acli` and `[TMS_TOOL]` -> `/xray-cli` or `/acli` depending on modality), see `CLAUDE.md` §Tool Resolution.

---

## TMS Integration (Jira/Xray)

Two TMS modalities are supported out of the box:

- **Modality A -- Xray on Jira**: full Xray entities (Test, Test Plan, Test Execution, Test Run, Pre-Condition). Primary tooling is the `/xray-cli` skill plus `/acli` for generic Jira issues.
- **Modality B -- Jira-native (no Xray)**: ATP/ATR live as Story custom fields + comment mirrors; TCs live as Jira `Test` issues. All TMS operations fall through to `/acli`. See `.claude/skills/test-documentation/references/jira-setup.md`.

For how skills resolve `[ISSUE_TRACKER_TOOL]` and `[TMS_TOOL]` tags to concrete CLIs or MCPs, see `CLAUDE.md` §Tool Resolution.

### Configuration

1. Get Xray API credentials from Jira
2. Add to `.env`:

```bash
XRAY_CLIENT_ID=your-client-id
XRAY_CLIENT_SECRET=your-client-secret
XRAY_PROJECT_KEY=YOUR-PROJECT
AUTO_SYNC=true
```

### Sync Test Results

```bash
# After test run
bun run test:sync

# Or enable auto-sync in CI
AUTO_SYNC=true bun run test
```

### Link Tests to Test Cases

```typescript
// Use @atc decorator with Jira key
test('@atc:UPEX-101 should validate login', async ({ loginPage }) => {
  // Test implementation
});
```

---

## Customization Guide

### 1. Update Project Identity

Edit these files:
- `package.json` - name, description, repository
- `CLAUDE.md` - project-specific context
- `config/variables.ts` - URLs and environments

### 2. Add Components

```bash
# Create a new page component
touch tests/components/ui/YourPage.ts

# Create a new API component
touch tests/components/api/YourApi.ts
```

Follow patterns in `ExamplePage.ts` and `ExampleApi.ts`.

### 3. Add Tests

```bash
# Create test directory
mkdir tests/e2e/your-module

# Create test file
touch tests/e2e/your-module/your-feature.test.ts
```

### 4. Generate Context

Load the `/project-discovery` skill in your AI assistant to generate project-specific context (idea, PRD, SRS, business-data-map, api-architecture, master-test-plan).

---

## Contributing

1. Load the `/test-automation` skill and read its `references/kata-ai-index.md`
2. Follow the automation standards referenced by that skill
3. Use conventional commits
4. Ensure all tests pass before PR

---

## Documentation

- `/test-automation` skill -- KATA planning + coding + review (includes KATA guide, automation standards, TypeScript patterns, TMS integration)
- `/sprint-testing` skill -- In-sprint QA (planning, execution, reporting)
- `/test-documentation` skill -- TMS test documentation and prioritization
- `/regression-testing` skill -- Regression execution and GO/NO-GO decisions
- `/project-discovery` skill -- Onboarding and context generation
- `.agents/skills/` is a symlink to `.claude/skills/` for agentskills.io spec compatibility
- `docs/` -- Human-facing docs (methodology, workflows, architectures)


---

## License

MIT License

---

**Made with KATA by [UPEX Galaxy](https://github.com/upex-galaxy)**
