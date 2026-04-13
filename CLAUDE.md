# Project Memory

> **Purpose**: Operational context loaded every AI session.
> **Usage**: AI reads this file automatically at session start.
> **Customize**: Replace `[PLACEHOLDER]` values with your project specifics.

---

## Quick Start

```bash
# READY TO WRITE TESTS:
# When you start a new test session, load these context files FIRST:
# 1. .context/business-data-map.md     → System flows and entities
# 2. .context/api-architecture.md      → API endpoints reference
# 3. .context/project-test-guide.md    → What to test and why
# 4. .context/guidelines/TAE/kata-ai-index.md → How to write tests (KATA)

# PLAN BEFORE CODING:
# Testing follows a Plan → Code → Review workflow. Never jump straight to code.
# See "Test Planning Scopes" below to choose the right planning prompt.
# Full automation workflow: .prompts/stage-5-automation/README.md

# WRITE A NEW TEST:
# 1. Pick planning prompt by scope (module / ticket / regression)
# 2. Use .prompts/stage-5-automation/coding/e2e-test-coding.md (E2E)
#    or .prompts/stage-5-automation/coding/integration-test-coding.md (API)
# 3. Follow KATA patterns in .context/guidelines/TAE/kata-ai-index.md
```

**Common test commands:**

```bash
bun run test              # Run all tests
bun run test:e2e          # E2E tests only
bun run test:integration  # API tests only
bun run test:smoke        # Smoke tests (@critical tagged)
bun run test:ui           # Visual UI mode
bun run test:allure       # Generate Allure report
```

**Generate/Update Project Documentation:**

```bash
# Use this prompt to regenerate README.md and update CLAUDE.md
@.prompts/utilities/context-engineering-setup.md
```

---

## ⚠️ Critical Reminders

> These rules override defaults and must always be in context.

1. **Login Credentials**: ALWAYS read from `.env` file — NEVER hardcode or guess passwords.
   - Example keys: `LOCAL_USER_EMAIL` / `LOCAL_USER_PASSWORD`, `STAGING_USER_EMAIL` / `STAGING_USER_PASSWORD`
2. **Plan before coding**: Always produce a test plan (`spec.md` / implementation plan) before writing test code.
3. **No AI attribution in commits**: Never include "Generated with Claude Code", "Co-Authored-By: Claude", or similar lines in commit messages.
4. **Shift-Left**: Evaluate Acceptance Criteria for clarity, testability, and completeness. Raise questions only when genuine gaps exist — never force questions to fill a checklist.
5. **Confirm before push to main**: Never push to `main` without explicit user confirmation.
6. [Add project-specific reminders here — e.g., "SPA and API are on different hosts — use correct base URLs"]

---

## Project Variables

> **Purpose**: Centralized project configuration referenced by all `.prompts/` and templates via `{{VARIABLE_NAME}}` syntax.
> **Usage**: Fill in real values once here. All prompts that use `{{VARIABLES}}` will auto-adapt.
> **Rationale**: Prevents multi-file maintenance — change a value once, it propagates everywhere.

| Variable | Description | Example Value |
|----------|-------------|---------------|
| `{{PROJECT_NAME}}` | Project name | MyProject |
| `{{BACKEND_REPO}}` | Relative path to backend repository | ../my-backend |
| `{{BACKEND_STACK}}` | Backend technology stack | Node.js + Express |
| `{{BACKEND_ENTRY}}` | Backend source entry point | src/ |
| `{{FRONTEND_REPO}}` | Relative path to frontend repository | ../my-frontend |
| `{{FRONTEND_STACK}}` | Frontend technology stack | React + TypeScript |
| `{{FRONTEND_ENTRY}}` | Frontend source entry point | src/ |
| `{{DB_TYPE}}` | Database engine | PostgreSQL |
| `{{DB_MCP_LOCAL}}` | MCP server name for local DB | myproject-local-db |
| `{{DB_MCP_STAGING}}` | MCP server name for staging DB | myproject-staging-db |
| `{{API_MCP_LOCAL}}` | MCP server name for local API | myproject-local-api |
| `{{API_MCP_STAGING}}` | MCP server name for staging API | myproject-staging-api |
| `{{SPA_URL_LOCAL}}` | Frontend URL (local) | localhost:3000 |
| `{{SPA_URL_STAGING}}` | Frontend URL (staging) | staging.myproject.com |
| `{{API_URL_LOCAL}}` | API base URL (local) | localhost:3000/api |
| `{{API_URL_STAGING}}` | API base URL (staging) | api-staging.myproject.com |
| `{{ISSUE_TRACKER}}` | Issue tracking tool | Jira |
| `{{ISSUE_TRACKER_CLI}}` | CLI command to query tickets | jira-cli / gh issue |
| `{{PROJECT_KEY}}` | Project key in issue tracker (e.g., PROJ, OB, UPEX) | PROJ |
| `{{TMS_CLI}}` | Test management CLI command | bun xray |
| `{{DEFAULT_ENV}}` | Default testing environment | staging |
| `{{JIRA_URL}}` | Jira instance base URL | https://company.atlassian.net |
| `{{WEBAPP_DOMAIN}}` | Domain of the web application under test | myproject.com |

**Note**: Variables are substituted lazily — a prompt containing `{{API_URL_STAGING}}` will read this table at load time. Keep values accurate.

---

## Tool Resolution

> When prompts use `[TAG_TOOL]` pseudocode, the AI resolves to the actual tool using this table.
> **Priority rule**: CLI tools first (fewer tokens, faster execution), MCP as fallback.
> Skills are self-documenting — the AI reads the skill file to learn exact syntax.

### Resolution Table

| Tag | Domain | Primary Tool | Fallback | Skill/Reference |
|-----|--------|-------------|----------|-----------------|
| `[TMS_TOOL]` | Test Management | `/xray-cli` skill | MCP Atlassian | `.claude/skills/xray-cli/` |
| `[ISSUE_TRACKER_TOOL]` | Issue Tracking | Atlassian CLI (`acli`) | MCP Atlassian | MCP tool list |
| `[AUTOMATION_TOOL]` | Browser Automation | `/playwright-cli` skill | MCP Playwright | `.claude/skills/playwright-cli/` |
| `[DB_TOOL]` | Database | DBHub MCP | Supabase MCP / raw SQL | MCP tool list |
| `[API_TOOL]` | API Exploration | OpenAPI MCP | Postman / curl | MCP tool list |

### How It Works

1. Prompts describe WHAT to do using `[TAG_TOOL]` pseudocode
2. The AI reads this table to determine WHICH tool to use
3. The AI reads the skill/MCP documentation to learn HOW to execute
4. If the primary tool is unavailable, try the fallback
5. If all tools are unavailable, inform the user

### Pseudocode Syntax

```
[TAG_TOOL] Action:
  - parameter: value
  - parameter: {per convention name}
  - parameter: {{PROJECT_VARIABLE}}
```

**Value types in pseudocode:**

| Type | Syntax | Example | When to use |
|------|--------|---------|-------------|
| Fixed/domain | Literal value | `type: Manual` | Domain concepts that never change |
| Convention reference | `{per <convention>}` | `title: {per TC naming convention}` | Forces AI to consult guidelines |
| Project variable | `{{VARIABLE}}` | `project: {{PROJECT_KEY}}` | Configured once per project |
| Context-derived | `{from <source>}` | `steps: {from test analysis}` | Derived during session |

### Convention References

| Convention | Guideline Location |
|-----------|-------------------|
| TC naming convention | `.context/guidelines/TAE/test-design-principles.md` |
| TC specification convention | `.context/guidelines/TAE/test-design-principles.md` |
| Labeling convention | `.prompts/stage-4-documentation/test-documentation.md` § Labels |
| Bug naming convention | `.prompts/stage-3-reporting/bug-report.md` § Summary format |
| Execution naming convention | `.prompts/stage-4-documentation/test-documentation.md` § Test Executions |

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

## Environment URLs

> Replace with your project URLs. Keep the same structure so tooling and context files can reference it.

| Environment | Frontend | Backend (API) |
|---|---|---|
| **Local** | `http://localhost:3000` | `http://localhost:3000/api` |
| **Staging** | `https://staging.example.com` | `https://staging.example.com/api` |
| **Production** | `https://example.com` | `https://example.com/api` |

> If the Frontend and Backend are on **different hosts**, document it here and make sure API tests target the API host directly.

---

## QA Workflow by Work Type

| Work Type | Workflow | Entry Point |
|-----------|---------|-------------|
| **User Story** | Full 6-stage workflow | `.prompts/session-start.md` → `.prompts/us-qa-workflow.md` |
| **Bug** | Triage → Verify → Report | `.prompts/session-start.md` → `.prompts/bug-qa-workflow.md` |

---

## Test Planning Scopes

| Scope | Prompt | When to Use |
|-------|--------|-------------|
| **Module-driven** (Macro) | `stage-5-automation/planning/module-test-specification.md` | Batch automation of entire module |
| **Ticket-driven** (Medium) | `stage-5-automation/planning/test-implementation-plan.md` | Automating a specific ticket |
| **Regression-driven** (Micro) | `stage-5-automation/planning/atc-implementation-plan.md` | Adding regression test after bug fix |

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

---

## Git Workflow

### Branch Strategy

| Branch | Role |
|---|---|
| `main` | Production. PRs merged from `staging` or `feature/*` after review. |
| `staging` | Integration branch for AI commits and pre-release validation. |
| `feature/*` | Task-specific branches for new work. Use `feature/TICKET-ID-desc`. |
| `fix/*` | Bug-fix branches. Use `fix/TICKET-ID-desc`. |

### Commit Rules

- **Semantic prefixes**: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`
- **One commit = one responsibility**
- **Clear messages**: Someone should understand the change without reading the diff
- **NO AI attribution**: Never include "Generated with Claude Code", "Co-Authored-By: Claude", or similar lines. Commits must look human-authored.
- **Confirm before push to main**: Always ask user confirmation before pushing to `main`.

### Example Flow

```bash
# General work (no ticket)
git add <files>
git commit -m "docs: update context files"
# → Ask: "Confirm push to main?"
git push origin main

# Ticket-based work
git checkout -b feature/UPEX-123-add-login-tests
git add <files>
git commit -m "test: add login API tests"
git push -u origin feature/UPEX-123-add-login-tests
gh pr create --base staging
```

→ **Full details**: `docs/workflows/git-flow.md`

---

## Context Loading by Task

| Task | Load These Files |
|------|------------------|
| **Write E2E Test** | `kata-ai-index.md` + `e2e-testing-patterns.md` |
| **Write API Test** | `kata-ai-index.md` + `api-testing-patterns.md` |
| **Exploratory Testing** | `project-test-guide.md` + `CLAUDE.md § Tool Resolution` |
| **Understand System** | `business-data-map.md` + `PRD/user-journeys.md` |
| **Use MCP Tools** | `CLAUDE.md § Tool Resolution` |
| **TMS Operations** | `tms-architecture.md` + `tms-conventions.md` + `tms-workflow.md` |
| **Create/Link TMS Artifacts** | `tms-architecture.md` (entity model + linking order) |
| **In-Sprint Testing** | `tms-workflow.md` + `tms-conventions.md` |

**Living Code Examples:**

- API Component: `tests/components/api/` (any `*Api.ts`)
- UI Component: `tests/components/ui/` (any `*Page.ts`)
- Test File: `tests/e2e/` or `tests/integration/`

---

## MCPs Available

| MCP | When to Use |
|-----|-------------|
| **Playwright** | E2E testing, UI automation, screenshots |
| **OpenAPI** | API endpoint exploration, contract testing |
| **DBHub** | Database queries, data validation |
| **Atlassian** | Jira/Xray test management |
| **Context7** | Official library documentation |
| **Tavily** | Web search, troubleshooting |

**Decision Rule:**

- Context7 for "how to use X" (official docs)
- Tavily for "how to solve X" (community solutions)


---

## AI Behavior During Testing

### Explanations and Confirmations

When working on testing a User Story or bug:

1. **Explain the story**: Once you understand the ticket, explain briefly:
   - What the feature is about
   - How it works (in simple terms)
   - What we'll be testing

2. **Wait for confirmation**: After important explanations, WAIT for the user to respond before continuing. This allows the user to:
   - Read and understand
   - Ask questions if needed
   - Confirm whether to proceed

3. **Explain defects**: When you find a bug or unexpected behavior:
   - Describe what you observed
   - Explain why it's a problem
   - Suggest the impact (severity, affected users, business risk)

4. **Language**: Default to **English**. If the user writes in another language, mirror that language for user-facing communication. Documentation and code are always written in English.

### Environment Selection

- Ask the user which environment they're working on (e.g., "local or staging?") when it's ambiguous.
- Default to **staging** unless the user specifies otherwise.
- Use the environment URLs from the "Environment URLs" table above and credentials from `.env`.

---

## Local Context (PBI)

For every ticket being tested, maintain local documentation under `.context/PBI/`:

```
.context/PBI/{module-name}/{TICKET-ID}-{brief-title}/
├── context.md          # Main file: ACs, test data, session notes, open questions
├── test-analysis.md    # Test plan / Acceptance Test Plan (ATP) mirror
├── test-report.md      # Test report / Acceptance Test Report (ATR) mirror
└── evidence/           # Screenshots, traces, logs (gitignored)
```

**Variables:**

- `{module-name}`: kebab-case of the module or epic (e.g., `user-management`)
- `{TICKET-ID}`: TMS ticket identifier (e.g., `UPEX-277`)
- `{brief-title}`: AI-generated summary of the ticket title, max ~5 words, kebab-case (e.g., `empty-states`)

**Entry point:** Start with `.prompts/session-start.md`, which:

1. Fetches ticket from the TMS (Jira/Xray)
2. Explains the story to the user → waits for confirmation
3. Loads project context files
4. Explores code in repositories
5. Identifies test data candidates
6. Creates the PBI folder
7. Configures any local tool settings (e.g., `.playwright/cli.config.json`)

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
- [ ] Atlassian MCP (Jira/Xray integration)
- [ ] OpenAPI MCP (API exploration)
- [ ] Context7 MCP (library documentation)
- [ ] Bun runtime installed
- [ ] Playwright browsers installed
- [ ] GitHub Actions workflows

### Pending / Manual Steps

- [ ] Populate `.env` with staging/production URLs
- [ ] Populate `.env` with test user credentials (`LOCAL_*`, `STAGING_*`)
- [ ] Configure TMS credentials (Xray Cloud: `XRAY_CLIENT_ID`, `XRAY_CLIENT_SECRET`)
- [ ] Run `bun run env:validate` to check configuration
- [ ] Restart Claude Code after any MCP credential change (configs are cached)

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
