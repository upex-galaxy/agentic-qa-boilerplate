# Framework Documentation Setup

> **Phase:** 3 - Infrastructure (Final Step)
> **Objective:** Create professional README + Update CLAUDE.md for the test automation project
> **Prerequisite:** KATA framework configured + Target project discovery completed
> **Output:** Updated `README.md` + `CLAUDE.md` with project-specific context

---

## Instructions for AI

This prompt generates/updates two essential documents:

1. **README.md** - Professional documentation for the test automation project
2. **CLAUDE.md** - Project memory updated with specific information

---

## STEP 1: Validate Prerequisites

### 1.1 Verify KATA Framework

Look for evidence that the KATA framework is configured:

```bash
# Run these checks
ls tests/components/TestContext.ts 2>/dev/null && echo "✓ TestContext exists"
ls tests/components/api/ApiBase.ts 2>/dev/null && echo "✓ ApiBase exists"
ls tests/components/ui/UiBase.ts 2>/dev/null && echo "✓ UiBase exists"
ls tests/utils/decorators.ts 2>/dev/null && echo "✓ Decorators exist"
ls playwright.config.ts 2>/dev/null && echo "✓ Playwright config exists"
ls .context/guidelines/TAE/KATA-AI-GUIDE.md 2>/dev/null && echo "✓ TAE Guidelines exist"
```

**Minimum criteria:** At least these must exist:

- `playwright.config.ts`
- `tests/components/` with base files
- `tests/utils/decorators.ts`

### 1.2 Verify Target Project Discovery

Look for evidence that target project discovery has been done:

```
Expected files (at least 2 of these):
├── .context/project-config.md         # Project connection
├── .context/business-data-map.md      # System flows
├── .context/api-architecture.md       # APIs to test
├── .context/project-test-guide.md     # Testing guide
└── .context/idea/                     # Business context
```

**Criteria:** At least `.context/project-config.md` must exist OR sufficient context to generate documentation.

### 1.3 Decision

```
IF KATA framework AND project context exist:
  → Continue to STEP 2

IF KATA framework is missing:
  → STOP and notify:
    "To generate documentation I need you to first
    configure the KATA framework.

    Run the prompt: utilities/kata-framework-setup.md
    Or clone from the boilerplate if it's a new project."

IF target project context is missing:
  → STOP and notify:
    "To generate specific documentation I need to understand
    the project you're going to test.

    Run in order:
    1. discovery/phase-1-constitution/project-connection.md
    2. context-generators/business-data-map.md (optional but recommended)
    3. context-generators/api-architecture.md (optional but recommended)

    Alternatively, manually provide:
    - Target project name
    - Application URL
    - Tech stack
    - Main functionalities to test"
```

---

## STEP 2: Gather Information

Read the following files to understand context:

### 2.1 Target Project Context

```
Read in priority order:
1. .context/project-config.md          # Connection configuration
2. .context/business-data-map.md       # Business flows
3. .context/api-architecture.md        # Available APIs
4. .context/project-test-guide.md      # What to test
5. .context/idea/business-model.md     # Business model (if exists)
```

**Extract:**

- Target project name
- Application URL(s) (dev, staging, prod)
- Target project tech stack
- Main entities/domains
- Available APIs
- Critical functionalities to test

### 2.2 Test Project Configuration

```
Read:
1. package.json                        # Scripts and dependencies
2. playwright.config.ts                # Playwright configuration
3. config/variables.ts                 # Environment variables
4. .env.example                        # Required variables
```

**Extract:**

- Available test scripts
- Configured Playwright projects (browsers, devices)
- Required environment variables
- Configured reporters (Allure, HTML, etc.)

### 2.3 Existing Tests Structure

```
Review:
1. tests/components/api/*.ts           # Created API components
2. tests/components/ui/*.ts            # Created UI components
3. tests/e2e/                          # Existing E2E tests
4. tests/integration/                  # Integration tests
```

**Extract:**

- Already implemented components
- Existing tests and their coverage
- Patterns used

### 2.4 CI/CD (if exists)

```
Review:
1. .github/workflows/*.yml             # GitHub Actions
2. azure-pipelines.yml                 # Azure DevOps
```

**Extract:**

- Configured pipelines
- Triggers (PR, push, schedule)
- Execution environments

---

## STEP 3: Generate README.md

### 3.1 Security Warnings

**README MUST NOT include:**

- ❌ Real credentials or API keys
- ❌ Production URLs with sensitive data
- ❌ Access tokens or secrets
- ❌ Personal user information

**Always use:**

- ✅ `.env.example` to document variables
- ✅ Placeholders: `{your-api-key}`, `{your-url}`
- ✅ References to internal documentation

### 3.2 README Template

```markdown
# {Project Name} - Test Automation

> Test automation suite for [{Target Project Name}]({Target repo URL if exists})
> Built with **KATA Framework** (Komponent Action Test Architecture) + Playwright

[![Playwright Tests](https://img.shields.io/badge/Playwright-{version}-green?logo=playwright)]
[![TypeScript](https://img.shields.io/badge/TypeScript-{version}-blue?logo=typescript)]
[![Bun](https://img.shields.io/badge/Bun-{version}-black?logo=bun)]

---

## Overview

This repository contains automated tests for **{Target Project Name}**, a {brief description of target project}.

### Test Coverage

| Type        | Status  | Description                |
| ----------- | ------- | -------------------------- |
| E2E         | {✅/🔄} | {E2E coverage description} |
| Integration | {✅/🔄} | {API coverage description} |
| Smoke       | {✅/🔄} | Critical path validation   |

### Target Application

| Aspect    | Value                       |
| --------- | --------------------------- |
| **URL**   | {Staging/dev URL}           |
| **Stack** | {Target project stack}      |
| **Repo**  | {Target repo URL if public} |

---

## Tech Stack

| Layer           | Technology               | Version   |
| --------------- | ------------------------ | --------- |
| **Test Runner** | Playwright               | {version} |
| **Framework**   | KATA                     | -         |
| **Language**    | TypeScript               | {version} |
| **Runtime**     | Bun                      | {version} |
| **Reporter**    | Allure + Playwright HTML | {version} |
| **Linting**     | ESLint + Prettier        | {version} |

---

## Project Structure
```

{project-name}/
├── tests/
│ ├── components/ # KATA Components Layer
│ │ ├── api/ # API components ({Entity}Api.ts)
│ │ ├── ui/ # UI components ({Entity}Page.ts)
│ │ └── preconditions/ # Reusable flows
│ ├── e2e/ # E2E test specs
│ │ └── {feature}/ # Grouped by feature
│ ├── integration/ # API integration tests
│ ├── data/
│ │ ├── fixtures/ # Test data (JSON)
│ │ ├── downloads/ # Downloaded files
│ │ └── uploads/ # Files to upload
│ └── utils/ # Utilities & decorators
├── config/ # Environment configuration
├── api/ # OpenAPI specs & generated types
├── scripts/ # Automation scripts
├── .context/ # AI context engineering
│ └── guidelines/TAE/ # KATA documentation
├── playwright.config.ts # Playwright configuration
└── .github/workflows/ # CI/CD pipelines

````

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- Access to {Target Project Name} (staging environment)
- {other specific requirements}

### Installation

```bash
# Clone the repository
git clone {repo-url}
cd {project-name}

# Install dependencies
bun install

# Install Playwright browsers
bunx playwright install chromium

# Copy environment variables
cp .env.example .env
````

### Environment Setup

Edit `.env` with your values:

```bash
# Target Application
BASE_URL={staging URL}
API_URL={API URL}

# Authentication (if required)
TEST_USER_EMAIL={test user email}
TEST_USER_PASSWORD={test user password}

# Optional
ALLURE_RESULTS_DIR=./allure-results
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

# Run on specific browser
bun run test:chromium
bun run test:firefox
bun run test:webkit
```

---

## Available Scripts

### Test Execution

| Script                      | Description                |
| --------------------------- | -------------------------- |
| `bun run test`              | Run all tests              |
| `bun run test:ui`           | Open Playwright UI mode    |
| `bun run test:debug`        | Run with debugger attached |
| `bun run test:headed`       | Run with browser visible   |
| `bun run test:e2e`          | Run E2E tests only         |
| `bun run test:integration`  | Run API tests only         |
| `bun run test:e2e:critical` | Run tests tagged @critical |

### Reports

| Script                         | Description                     |
| ------------------------------ | ------------------------------- |
| `bun run test:report`          | Open Playwright HTML report     |
| `bun run test:allure`          | Generate and open Allure report |
| `bun run test:allure:generate` | Generate Allure report only     |

### Code Quality

| Script                 | Description               |
| ---------------------- | ------------------------- |
| `bun run lint`         | Run ESLint                |
| `bun run lint:fix`     | Fix linting issues        |
| `bun run format`       | Format code with Prettier |
| `bun run format:check` | Check code formatting     |
| `bun run type-check`   | TypeScript type checking  |

### Utilities

| Script                  | Description                   |
| ----------------------- | ----------------------------- |
| `bun run kata:manifest` | Extract ATCs from codebase    |
| `bun run api:sync`      | Sync OpenAPI spec from target |
| `bun run api:types`     | Generate TypeScript types     |
| `bun run clean`         | Remove test artifacts         |

---

## KATA Framework

This project uses the **KATA** (Komponent Action Test Architecture) pattern:

### Component Types

| Component        | Purpose           | Location                          |
| ---------------- | ----------------- | --------------------------------- |
| **Api**          | HTTP interactions | `tests/components/api/`           |
| **Page**         | UI interactions   | `tests/components/ui/`            |
| **Precondition** | Reusable flows    | `tests/components/preconditions/` |

### Key Concepts

- **@atc decorator**: Links test actions to test case IDs
- **Fixtures**: Dependency injection for components
- **Base classes**: ApiBase, UiBase provide common functionality

### Example Test

```typescript
import { test, expect } from '@TestFixture';

test.describe('User Management', () => {
  test('@atc:PROJ-E2E-001 should create new user', async ({ userPage }) => {
    await userPage.createUserSuccessfully({
      name: 'Test User',
      email: 'test@example.com',
    });
  });
});
```

See `.context/guidelines/TAE/KATA-AI-GUIDE.md` for detailed documentation.

---

## CI/CD

{If workflows exist, document them here}

### GitHub Actions

| Workflow         | Trigger             | Description           |
| ---------------- | ------------------- | --------------------- |
| `playwright.yml` | PR to main          | Run full test suite   |
| `smoke.yml`      | Push to main        | Run smoke tests only  |
| `regression.yml` | Scheduled (nightly) | Full regression suite |

---

## Test Data Management

### Fixtures

Static test data lives in `tests/data/fixtures/`:

```bash
tests/data/fixtures/
├── users.json       # User test data
├── products.json    # Product test data
└── ...
```

### Dynamic Data

Use `@faker-js/faker` for dynamic test data:

```typescript
import { faker } from '@faker-js/faker';

const user = {
  name: faker.person.fullName(),
  email: faker.internet.email(),
};
```

---

## Reporting

### Allure Reports

```bash
# Generate and open report
bun run test:allure

# View existing report
bun run test:allure:open
```

### Playwright HTML Report

```bash
bun run test:report
```

---

## Contributing

1. Read `.context/guidelines/TAE/KATA-AI-GUIDE.md`
2. Follow automation standards in `.context/guidelines/TAE/automation-standards.md`
3. Use conventional commits
4. Ensure all tests pass before PR

---

## AI-Assisted Development

This project uses **Context Engineering** for AI-assisted test development.

### Key Context Files

| File                             | Purpose                      |
| -------------------------------- | ---------------------------- |
| `.context/business-data-map.md`  | Understand system flows      |
| `.context/api-architecture.md`   | Know the APIs to test        |
| `.context/project-test-guide.md` | What to test and why         |
| `.context/guidelines/TAE/`       | KATA framework documentation |

### For AI Agents

See `CLAUDE.md` for context loading instructions.

---

## Links

- [KATA AI Guide](.context/guidelines/TAE/KATA-AI-GUIDE.md)
- [Automation Standards](.context/guidelines/TAE/automation-standards.md)
- [Target Project]({target repo URL})

---

**Last Updated**: {current date}

````

---

## STEP 4: Update CLAUDE.md

### 4.1 Sections to Update

Read the existing `CLAUDE.md` and update the following sections:

**Project Identity:**

```markdown
## Project Identity

| Aspect         | Value                           |
| -------------- | ------------------------------- |
| **Name**       | {Target Project Name}           |
| **Type**       | {Web app / API / Mobile / etc.} |
| **Stack**      | {Target project stack}          |
| **Repository** | {Target repo URL}               |
| **Test Repo**  | {This test automation repo URL} |
````

**Discovery Progress:**

Mark as completed the prompts that have been executed (based on files found).

**Access Configuration:**

```markdown
## Access Configuration

### MCPs Available

- [x] Playwright (test automation)
- [{status}] Jira/Confluence (Atlassian MCP)
- [{status}] GitHub
- [{status}] Supabase (if applicable)
- Other: {list of specific MCPs}

### CLI Tools

- [x] `gh` (GitHub CLI)
- [{status}] `atlassian` (Atlassian MCP)
- Other: {list}

### Credentials Status

- [{status}] Target app access configured
- [{status}] Test user credentials configured
- [{status}] API access configured
```

**Key Decisions & Notes:**

```markdown
## Key Decisions & Notes

### Testing Decisions

- Test Strategy: {E2E heavy / API heavy / balanced}
- Priority browsers: {chromium / all}
- Test data approach: {fixtures / faker / API seeding}

### Known Issues

- {known issues from target project that affect testing}
```

**Session Log:**

```markdown
## Session Log

### {current date} - Project Documentation Setup

- Completed: Generated README.md + Updated CLAUDE.md
- Context: {summary of project context}
- Next: {recommended next phase}
```

---

## STEP 5: Create/Update Files

### 5.1 Write README.md

```
Location: ./README.md (project root)
Action: Create new or replace existing
```

### 5.2 Update CLAUDE.md

```
Location: ./CLAUDE.md (project root)
Action: Update specific sections, DO NOT replace entire file
```

---

## STEP 6: Notify User

```
✅ Test automation project documentation generated successfully

Updated files:
├── README.md    # Professional test project documentation
└── CLAUDE.md    # Updated project memory

📝 README.md includes:
  - Project overview and test coverage
  - Testing tech stack
  - Test project structure
  - Installation and configuration guide
  - Available scripts
  - KATA framework documentation
  - Configured CI/CD pipelines

🤖 CLAUDE.md updated with:
  - Project Identity completed
  - Discovery Progress updated
  - MCPs and CLI tools configured
  - Testing decisions documented
  - Session log started

💡 Next steps:
  1. Review README.md and adjust as needed
  2. Verify CLAUDE.md has correct information
  3. Continue with Phase 4 (Specification) or Stage 1 (Shift-Left Testing)

🔗 To create tests:
  - E2E: Use stage-4-automation/automation-e2e-test.md
  - API: Use stage-4-automation/automation-integration-test.md
  - Manual: Use stage-2-exploratory/ui-exploration.md
```

---

## STEP 7: Post-Generation Review

### README.md Checklist

- [ ] Target project name correct
- [ ] URLs updated (staging, not production)
- [ ] Tech stack verified
- [ ] package.json scripts synced
- [ ] Folder structure updated
- [ ] CI/CD workflows documented
- [ ] No credentials exposed

### CLAUDE.md Checklist

- [ ] Project Identity completed
- [ ] Discovery Progress reflects real state
- [ ] Available MCPs correct
- [ ] Available CLI tools correct
- [ ] Testing decisions documented
- [ ] Session log started

---

## Final Checklist

- [ ] Prerequisites validated (KATA + Discovery)
- [ ] Target project information gathered
- [ ] Test project information gathered
- [ ] README.md generated with all information
- [ ] CLAUDE.md updated with specific context
- [ ] User notified of changes
- [ ] No sensitive information exposed

---

**Version:** 1.0
**Last Updated:** {execution date}
**Author:** UPEX Galaxy - AI-Driven Test Automation Boilerplate
