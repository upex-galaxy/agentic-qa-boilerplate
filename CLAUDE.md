# Project Memory

> **Purpose**: Operational context loaded every AI session.
> **Usage**: AI reads this file automatically at session start.
> **Customize**: Replace `[PLACEHOLDER]` values with your project specifics.

---

## Quick Start

```bash
# Run all tests
bun run test

# E2E tests only
bun run test:e2e

# API tests only
bun run test:integration

# Smoke tests (@critical tagged)
bun run test:smoke

# Visual UI mode
bun run test:ui

# Generate Allure report
bun run test:allure
```

**Write a New Test:**
1. Load: `.context/guidelines/TAE/kata-ai-index.md`
2. Use prompt: `.prompts/stage-5-automation/coding/e2e-test-coding.md`
3. Follow KATA patterns

**Generate/Update Project Documentation:**
```bash
# Use this prompt to regenerate README.md and update CLAUDE.md
@.prompts/utilities/context-engineering-setup.md
```

---

## Project Identity

> Replace placeholders with your project details.

| Aspect | Value |
|--------|-------|
| **Name** | [Your Project Name] |
| **Type** | [e.g., B2B Web Platform, E-commerce, SaaS] |
| **Stack** | [e.g., React + TypeScript (FE), Node.js (BE), PostgreSQL] |
| **Target Repo** | [Path to application repository] |
| **Test Repo** | [Path to this test repository] |
| **Test Framework** | Playwright + KATA + Allure |

**TL;DR Flow:**
```
[User Action] → [System Process] → [Outcome]
```

---

## Fundamental Rules (Always in Memory)

### TypeScript Patterns

| Pattern | Rule |
|---------|------|
| **Parameters** | Max 2 positional. 3+ → use object parameter |
| **Utilities** | Only agnostic utilities go to `tests/utils/` |
| **Locators** | Inline in ATCs. Extract only if used 2+ times |
| **Imports** | Always use aliases (`@api/`, `@schemas/`, `@utils/`). No relative imports |
| **Types** | Define interfaces at top of file, after imports |
| **Errors** | Public methods: fail fast. Utilities: silent fail (return null) |

**DRY - Context Matters:**
- `api/schemas/` = OpenAPI type facades (`@schemas/{domain}.types`)
- `tests/utils/` = Agnostic utilities only (works for API + UI)
- `UiBase` = All Playwright/Page helpers
- `ApiBase` = All HTTP helpers
- `TestContext` = Shared across both (config, faker)

→ **Full details**: `.context/guidelines/TAE/typescript-patterns.md`

### KATA Architecture

```
TestContext (Layer 1) - Config, Faker, utilities
    ↓ extends
ApiBase / UiBase (Layer 2) - HTTP / Playwright helpers
    ↓ extends
YourApi / YourPage (Layer 3) - ATCs live here
    ↓ used by
TestFixture (Layer 4) - Dependency injection
    ↓ used by
Test Files - Orchestrate ATCs
```

**ATC Rules:**
- ATC = Complete test case (mini-flow), NOT single interaction
- ATCs are atomic: don't call other ATCs
- Use Steps module for reusable ATC chains
- Fixed assertions inside ATC, test-level assertions in test file
- Equivalence Partitioning: same output = one parameterized ATC

**Fixture Selection:**
| Test Type | Fixture | Browser? |
|-----------|---------|----------|
| API only | `{ api }` | No (lazy) |
| UI only | `{ ui }` | Yes |
| Hybrid | `{ test }` | Yes |

→ **Full details**: `.context/guidelines/TAE/kata-architecture.md`

### Git Flow

**Branches:**
```
main     ← Production (PRs from staging)
staging  ← Integration (AI commits here)
feature/* ← Task-specific branches
```

**Commit Prefixes:**
| Prefix | Use |
|--------|-----|
| `feat:` | New functionality |
| `fix:` | Bug correction |
| `test:` | Tests added/modified |
| `docs:` | Documentation only |
| `refactor:` | Code restructuring |
| `chore:` | Maintenance tasks |

**Rules:**
- One commit = one responsibility
- Clear messages (someone should understand without seeing code)
- Push to `main` only after user confirmation
- PRs for ticket work: `feature/TICKET-ID-desc` → staging/main

→ **Full details**: `docs/workflows/git-flow.md`

---

## Context Loading by Task

| Task | Load These Files |
|------|------------------|
| **Write E2E Test** | `kata-ai-index.md` + `e2e-testing-patterns.md` |
| **Write API Test** | `kata-ai-index.md` + `api-testing-patterns.md` |
| **Exploratory Testing** | `project-test-guide.md` + MCP guides |
| **Understand System** | `business-data-map.md` + `PRD/user-journeys.md` |
| **Use Database MCP** | `guidelines/MCP/dbhub.md` |
| **Use Playwright MCP** | `guidelines/MCP/playwright.md` |
| **Use OpenAPI MCP** | `guidelines/MCP/openapi.md` |

**Living Code Examples:**
- API Component: `tests/components/api/` (any `*Api.ts`)
- UI Component: `tests/components/ui/` (any `*Page.ts`)
- Test File: `tests/e2e/` or `tests/integration/`

---

## MCPs Available

| MCP | When to Use | Guide |
|-----|-------------|-------|
| **Playwright** | E2E testing, UI automation, screenshots | `guidelines/MCP/playwright.md` |
| **OpenAPI** | API endpoint exploration, contract testing | `guidelines/MCP/openapi.md` |
| **DBHub** | Database queries, data validation | `guidelines/MCP/dbhub.md` |
| **Atlassian** | Jira/Xray test management | `guidelines/MCP/atlassian.md` |
| **Context7** | Official library documentation | `guidelines/MCP/context7.md` |
| **Tavily** | Web search, troubleshooting | `guidelines/MCP/tavily.md` |

**Decision Rule:**
- Context7 for "how to use X" (official docs)
- Tavily for "how to solve X" (community solutions)

→ **Full decision tree**: `.context/guidelines/MCP/README.md`

---

## CLI Tools

| Script | Usage | Documentation |
|--------|-------|---------------|
| `bun xray` | TMS sync (import/export/sync) | `cli/xray.ts` (self-documented) |
| `bun run api:sync` | Sync OpenAPI spec + generate types | `cli/sync-openapi.ts` |
| `bun run kata:manifest` | Extract ATCs from codebase | See `package.json` |

**Run `bun <script> --help`** for usage details.

---

## Skills (Claude Code)

> Pre-built skills available in `.claude/skills/`. These are loaded automatically by Claude Code.

| Skill | Trigger | Description |
|-------|---------|-------------|
| **playwright-cli** | `/playwright-cli` | Browser automation: screenshots, tracing, video recording, session management, request mocking, test generation |
| **xray-cli** | `/xray-cli` | Xray Cloud test management: create tests, manage executions, import results, backup/restore |

**Note:** Skills are committed to the repo so anyone who clones the project gets them out of the box. User-specific settings (`.claude/settings.local.json`) are gitignored.

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
│   └── steps/                # Reusable step chains (preconditions)
├── e2e/                      # E2E tests
├── integration/              # API tests
└── data/fixtures/            # Test data JSON
```

---

## Critical Test Priorities

> Update with your project's priorities.

| Priority | Flow | Business Impact | Status |
|----------|------|-----------------|--------|
| Critical | [Flow 1] | [Why it matters] | [ ] |
| Critical | [Flow 2] | [Why it matters] | [ ] |
| High | [Flow 3] | [Why it matters] | [ ] |

---

## Discovery Progress

> Track which discovery prompts have been completed.

| Phase | Status | Output Files |
|-------|--------|--------------|
| Phase 1: Constitution | [Pending/Done] | `idea/*` |
| Phase 2: Architecture | [Pending/Done] | `PRD/*`, `SRS/*` |
| Phase 3: Infrastructure | [Pending/Done] | `SRS/infrastructure.md` |
| Context Generators | [Pending/Done] | `business-data-map`, `api-architecture`, `project-test-guide` |

---

## Access Configuration

### Configured
- [ ] Playwright MCP (browser automation)
- [ ] Database MCP (data validation)
- [ ] Atlassian MCP (Jira integration)
- [ ] OpenAPI MCP (API exploration)
- [ ] Bun runtime
- [ ] GitHub Actions workflows

### Pending
- [ ] Staging environment URLs in `.env`
- [ ] Test user credentials in `.env`
- [ ] TMS credentials (Xray)

---

## Testing Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Priority** | [API first / E2E first] | [Reason] |
| **Browsers** | [Chromium / multi-browser] | [Reason] |
| **Test Data** | [Faker / fixtures / both] | [Reason] |
| **Isolation** | Each test independent | Standard practice |

---

## Known Issues & Blockers

| Issue | Severity | Status |
|-------|----------|--------|
| [Issue description] | [HIGH/MEDIUM/LOW] | [Open/Resolved] |

---

## Session Log

> Log significant changes per session. Delete old entries as needed.

### [DATE] - [Session Title]
- [Change 1]
- [Change 2]
- Result: [Outcome]

---

## Next Actions

1. **[Priority 1]**
   - [ ] [Subtask]
   - [ ] [Subtask]

2. **[Priority 2]**
   - [ ] [Subtask]

---

**Last Updated**: [DATE]
**Session Count**: [N]
