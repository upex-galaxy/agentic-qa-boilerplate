# AI-Driven Test Automation Boilerplate

> A production-ready test automation framework built with **Playwright**, **TypeScript**, and **KATA Architecture**.
> Designed for AI-assisted test development with comprehensive context engineering.

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
| **Prompt Library** | Pre-built prompts for AI-assisted test development |
| **MCP Integration** | Ready for Playwright, Database, and API MCPs |

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- Node.js 18+ (for some Playwright features)

### Installation

```bash
# Clone the repository
git clone https://github.com/upex-galaxy/ai-driven-test-automation-boilerplate.git
cd ai-driven-test-automation-boilerplate

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
│   ├── idea/                     # Business context (generated)
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

This boilerplate is optimized for AI-assisted test development.

### Complete Adaptation Flow

When you clone this template, follow this flow to adapt it to your project:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. CLONE TEMPLATE                                           │
│    git clone https://github.com/upex-galaxy/               │
│      ai-driven-test-automation-boilerplate.git my-tests    │
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
│    • Generates .context/ (idea/, PRD/, SRS/)               │
│    • Generates business-data-map / api-architecture /      │
│      project-test-guide                                     │
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

### Context Engineering

The `.context/` directory contains structured documentation for AI:

```
.context/
├── PRD/                  # What to build (generated)
├── SRS/                  # How it works (generated)
├── idea/                 # Business context (generated)
└── PBI/                  # What to test (generated, per ticket)
```

Guidelines and workflow instructions live inside the Claude Code skills under `.claude/skills/` (each skill ships with its own `references/`).

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
```

### CLAUDE.md

The `CLAUDE.md` file serves as AI memory. Customize it for your project:

1. Update project identity
2. Document critical test priorities
3. Track context files
4. Log decisions and progress

---

## TMS Integration (Jira/Xray)

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

Load the `/project-discovery` skill in your AI assistant to generate project-specific context (idea, PRD, SRS, business-data-map, api-architecture, project-test-guide).

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
- `docs/` -- Human-facing docs (methodology, workflows, architectures)


---

## License

MIT License

---

**Made with KATA by [UPEX Galaxy](https://github.com/upex-galaxy)**
