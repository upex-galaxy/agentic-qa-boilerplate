# CLAUDE.md - Project Memory Template

> **Purpose**: This file maintains project context across AI sessions.
> **Usage**: AI reads this file at session start to resume context.
> **Customize**: Replace all `[PLACEHOLDER]` values with your project specifics.

---

## Quick Start

```bash
# GETTING STARTED:
# 1. Run discovery prompts to generate context
# 2. Customize this file with your project details
# 3. AI will use this as primary context

# WRITE A NEW TEST:
# 1. Load: .context/guidelines/TAE/KATA-AI-GUIDE.md
# 2. Use: .prompts/stage-4-automation/automation-e2e.md
# 3. Follow KATA patterns for test structure
```

---

## Project Identity

> **Instructions**: Update this section with your project details.

| Aspect | Value |
|--------|-------|
| **Name** | [Your Project Name] |
| **Type** | [e.g., B2B Web Platform, E-commerce, SaaS] |
| **Stack** | [e.g., React + TypeScript (FE), Node.js (BE), PostgreSQL] |
| **Target Repo** | [Path to application repository] |
| **Test Repo** | [Path to this test repository] |
| **Test Framework** | Playwright + KATA + Allure |

---

## What is [Project Name]? (TL;DR)

> **Instructions**: Describe your application's main flow in one line.

```
[User Action] → [System Process] → [Outcome]
Example: User creates order → System processes payment → Order confirmed
```

**Main Actors:**

- **[Actor 1]** (Role) - What they do
- **[Actor 2]** (Role) - What they do
- **[Actor 3]** (Role) - What they do

**Key Metrics:**

- ~X Users
- ~X Transactions/month
- ~X [Other relevant metric]

---

## Critical Test Priorities

> **Instructions**: List your highest priority test areas based on business impact.

| Priority | Flow | Business Impact | Status |
|----------|------|-----------------|--------|
| Critical | [Flow 1] | [Why it matters] | [ ] |
| Critical | [Flow 2] | [Why it matters] | [ ] |
| Critical | [Flow 3] | [Why it matters] | [ ] |
| High | [Flow 4] | [Why it matters] | [ ] |
| High | [Flow 5] | [Why it matters] | [ ] |

**Key Business Rules to Test:**

1. [Rule 1 - describe the condition and expected behavior]
2. [Rule 2 - describe the condition and expected behavior]
3. [Rule 3 - describe the condition and expected behavior]

---

## Context Loading Guide

### For Writing Tests (Most Common)

```markdown
Load in this order:
1. `.context/project-test-guide.md` → What to test and why
2. `.context/api-architecture.md` → API endpoints with examples
3. `.context/guidelines/TAE/KATA-AI-GUIDE.md` → How to write tests
```

### For Understanding the System

```markdown
1. `.context/business-data-map.md` → Complete system flows
2. `.context/idea/domain-glossary.md` → Domain terms
3. `.context/PRD/user-journeys.md` → User flows
```

### By Task Type

| Task | Load These Files |
|------|------------------|
| **Write E2E Test** | `project-test-guide.md` + `guidelines/TAE/KATA-AI-GUIDE.md` |
| **Write API Test** | `api-architecture.md` + `guidelines/TAE/KATA-AI-GUIDE.md` |
| **Validate Database** | `business-data-map.md` + Database MCP |
| **Exploratory Testing** | `project-test-guide.md` + Playwright MCP |
| **Understand Business Flow** | `business-data-map.md` + `idea/business-model.md` |

---

## Context Loading for Implementation Work

**CRITICAL**: Before writing or modifying code, ALWAYS load relevant guidelines.

### Required Guidelines by Task

| Task Type | Load These Guidelines FIRST |
|-----------|----------------------------|
| **Write Component (API/UI)** | `guidelines/TAE/KATA-AI-GUIDE.md` + `guidelines/TAE/typescript-patterns.md` |
| **Write Test File** | `guidelines/TAE/automation-standards.md` |
| **Modify UiBase/ApiBase** | `guidelines/TAE/kata-architecture.md` + `guidelines/TAE/typescript-patterns.md` |
| **Create Utility** | `guidelines/code-standards.md` + `guidelines/TAE/typescript-patterns.md` |
| **Any TypeScript Code** | `guidelines/TAE/typescript-patterns.md` |

### Key Principles (Quick Reference)

1. **DRY**: No duplicate code - extract to shared utilities only when agnostic
2. **Max 2 Params**: Use object parameters for 3+ arguments
3. **Context Matters**:
   - `tests/utils/` = Agnostic utilities only (works for API + UI)
   - `UiBase` = All Playwright/Page helpers
   - `ApiBase` = All HTTP helpers
   - `TestContext` = Shared across both (config, faker)
4. **Locators Inline**: In ATCs, extract only if used 2+ times
5. **ATCs are Atomic**: Don't call other ATCs

### Architecture Layers (Quick Reference)

```
TestContext (Layer 1)
    ↓ extends
UiBase / ApiBase (Layer 2) ← Helpers go here
    ↓ extends
YourPage / YourApi (Layer 3) ← ATCs go here
    ↓ used by
TestFixture (Layer 4) ← DI entry point
    ↓ used by
Test Files ← Orchestrate ATCs
```

---

## Available Context Files

> **Instructions**: Update this tree as you generate context files.

```
.context/
├── guidelines/
│   ├── README.md             # Guidelines index
│   ├── code-standards.md     # General coding standards
│   ├── mcp-usage-tips.md     # MCP tool guidance
│   ├── TAE/                  # Test Automation (PRIMARY)
│   │   ├── KATA-AI-GUIDE.md  # AI entry point
│   │   ├── kata-architecture.md
│   │   ├── automation-standards.md
│   │   └── ... (more files)
│   ├── QA/                   # Manual testing (reference)
│   │   └── ... (QA guidelines)
│   └── MCP/                  # MCP integration guides
│       ├── atlassian.md      # Jira/Confluence
│       ├── playwright.md     # Browser automation
│       └── ... (more guides)
├── PRD/                      # Product requirements (generate with prompts)
│   └── README.md             # Instructions
├── SRS/                      # Technical specs (generate with prompts)
│   └── README.md             # Instructions
├── idea/                     # Business context (generate with prompts)
│   └── README.md             # Instructions
└── PBI/                      # Backlog items (generate with prompts)
    └── README.md             # Instructions
```

---

## Key API Endpoints (Quick Reference)

> **Instructions**: Document your most important API endpoints here.

| Domain | Endpoint | Auth | Testing Notes |
|--------|----------|------|---------------|
| Auth | POST `/auth/login` | Public | Get JWT token |
| [Domain] | GET `/[endpoint]` | [Auth] | [Notes] |
| [Domain] | POST `/[endpoint]` | [Auth] | [Notes] |
| [Domain] | PUT `/[endpoint]` | [Auth] | [Notes] |

**Base URLs:**

- Local: `http://localhost:[PORT]/api`
- Staging: `https://staging.[domain]/api`

---

## Test Project Structure

```
tests/
├── components/
│   ├── TestContext.ts        # Layer 1: Config + Faker
│   ├── TestFixture.ts        # Layer 4: Unified fixture
│   ├── api/
│   │   ├── ApiBase.ts        # Layer 2: HTTP client
│   │   └── [YourApi.ts]      # Layer 3: Domain components
│   ├── ui/
│   │   ├── UiBase.ts         # Layer 2: Page base
│   │   └── [YourPage.ts]     # Layer 3: Domain components
│   └── flows/                # Reusable setup flows
├── e2e/                      # E2E tests
│   └── [your-module]/        # Organized by feature
├── integration/              # API tests
│   └── [your-module]/        # Organized by domain
└── data/
    └── fixtures/             # Test data JSON
```

---

## MCP Tools Available

> **Instructions**: Document which MCPs are configured for your project.

| MCP | Status | Use Case |
|-----|--------|----------|
| `mcp__playwright__*` | [Active/Inactive] | Browser automation, UI testing |
| `mcp__[database]__*` | [Active/Inactive] | Database queries, validation |
| `mcp__atlassian__*` | [Active/Inactive] | Jira integration |

---

## Discovery Progress

> **Instructions**: Track which discovery prompts have been completed.

| Phase | Status | Output Files |
|-------|--------|--------------|
| Phase 1: Constitution | [Status] | `project-config`, `idea/*` |
| Phase 2: Architecture | [Status] | `PRD/*`, `SRS/*` |
| Phase 3: Infrastructure | [Status] | `SRS/infrastructure.md` |
| Context Generators | [Status] | `business-data-map`, `api-architecture`, `project-test-guide` |

---

## QA Stages (Per User Story)

| Stage | Prompts Available | Purpose |
|-------|-------------------|---------|
| 1 | `stage-1-shift-left/feature-test-plan.md` | Test planning |
| 2 | `stage-2-exploratory/*.md` | Manual/exploratory testing |
| 3 | `stage-3-documentation/*.md` | TMS documentation |
| 4 | `stage-4-automation/*.md` | Write automated tests |
| 5 | `stage-5-shift-right/*.md` | CI/CD, monitoring |

---

## Test Commands

```bash
# Run all tests
bun run test

# E2E tests only
bun run test:e2e

# API tests only
bun run test:integration

# Visual UI mode
bun run test:ui

# Generate Allure report
bun run test:allure

# Sync to TMS
bun run test:sync
```

---

## Access Configuration

### Configured

- [ ] Playwright MCP (browser automation)
- [ ] Database MCP (data validation)
- [ ] Atlassian MCP (Jira integration)
- [ ] Bun runtime
- [ ] GitHub Actions workflows

### Not Configured (Pending)

- [ ] Staging environment URLs
- [ ] Test user credentials in `.env`
- [ ] TMS credentials (Xray)

---

## Testing Decisions

### Test Strategy

- **Priority**: [API tests first / E2E first] - [reason]
- **Browsers**: [Chromium primary / multi-browser]
- **Data**: [Dynamic via Faker / fixtures / both]
- **Isolation**: Each test should be independent

### Key Patterns

- Use `@atc` decorator to link tests to test case IDs
- Page Objects go in `tests/components/ui/`
- API clients go in `tests/components/api/`
- Flows for reusable setup flows

---

## Git Workflow

### Branch Strategy

| Scenario | Strategy |
|----------|----------|
| **General work** | Commit to `main` after confirmation |
| **Ticket work** | Create `feature/TICKET-ID-desc` branch → PR |

### Commit Rules

- **Semantic prefixes**: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`
- **Confirm before push**: Always ask user confirmation before pushing to `main`

---

## Known Issues & Blockers

> **Instructions**: Track issues that affect testing.

| Issue | Severity | Status |
|-------|----------|--------|
| [Issue description] | [HIGH/MEDIUM/LOW] | [Status] |

---

## Session Log

> **Instructions**: Log significant changes per session. Delete old entries as needed.

### [DATE] - [Session Title]

- [Change 1]
- [Change 2]
- [Change 3]
- Result: [Outcome]

---

## Next Actions

> **Instructions**: Keep this updated with immediate priorities.

1. **[Priority 1]**
   - [Subtask]
   - [Subtask]

2. **[Priority 2]**
   - [Subtask]
   - [Subtask]

---

**Last Updated**: [DATE]
**Session Count**: [N]
**Status**: [Current status]
