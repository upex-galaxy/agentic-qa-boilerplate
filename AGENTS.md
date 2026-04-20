# Project Memory

> Operational context loaded every AI session. Replace `[PLACEHOLDER]` values with your project specifics.

---

## Quick Start

This project is driven by **agent skills**. Each skill owns an end-to-end slice of the QA lifecycle and self-loads its own operational detail. Invoke a skill by its trigger phrase (e.g. "run regression", "write E2E test", "document these tests", "onboard this repo") and the matching skill will take over.

The Stages 1-6 pipeline is distributed across skills:

- **Stages 1-3** (plan, execute, report per ticket) -> `/sprint-testing`
- **Stage 4** (TMS documentation + ROI) -> `/test-documentation`
- **Stage 5** (automation: plan, code, review) -> `/test-automation`
- **Stage 6** (regression, GO/NO-GO) -> `/regression-testing`
- **Project setup / onboarding** -> `/project-discovery`

**Common test commands:**

```bash
bun run test              # Run all tests
bun run test:e2e          # E2E tests only
bun run test:integration  # API tests only
bun run test:smoke        # Smoke tests (@critical tagged)
bun run test:ui           # Visual UI mode
bun run test:allure       # Generate Allure report
```

---

## Critical Rules (Always Apply)

1. **Login Credentials**: ALWAYS read from `.env` file -- NEVER hardcode or guess passwords.
   - Example keys: `LOCAL_USER_EMAIL` / `LOCAL_USER_PASSWORD`, `STAGING_USER_EMAIL` / `STAGING_USER_PASSWORD`

2. **Plan Before Coding**: Always produce a test plan (`spec.md` / implementation plan) before writing test code. Testing follows Plan -> Code -> Review.

3. **No AI Attribution**: Never include "Generated with Claude Code", "Co-Authored-By: Claude", or similar lines in commit messages. Commits must look human-authored.

4. **Shift-Left**: Evaluate Acceptance Criteria for clarity, testability, and completeness. Raise questions only when genuine gaps exist -- never force questions to fill a checklist.

5. **Confirm Before Push to Main**: Never push to `main` without explicit user confirmation.

6. **Git History Management**:
   - NEVER rewrite pushed history (`rebase`, `amend` on pushed commits)
   - NEVER force push to any shared branch
   - NEVER delete remote branches without confirmation
   - ALWAYS add forward (new commits to fix, not rewrite)
   - ALWAYS preserve merge history

7. **Quality Verification**: After code changes, verify in order: run tests -> check types -> lint. Do not skip steps.

8. **File Operations**: Always read a file before editing it. Preserve existing formatting and indentation. Never overwrite files without reading first.

9. **Skills-First**: All operational workflows live in `.claude/skills/`. Never ask users to copy-paste instructions. Invoke the relevant skill and let it self-load its detail. Use `[TAG_TOOL]` pseudocode and `{{VARIABLES}}` for dynamic content.

10. **Playwright CLI Usage**: For browser automation, load the `/playwright-cli` skill. It provides screenshots, tracing, video recording, session management, and request mocking. See `.claude/skills/playwright-cli/` for details.

---

## Project Variables

> Centralized configuration referenced by all skills via `{{VARIABLE_NAME}}` syntax. Fill in real values once; all skills auto-adapt.

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

---

## Tool Resolution

> When skills use `[TAG_TOOL]` pseudocode, resolve to the actual tool using this table.
> **Priority**: CLI tools first (fewer tokens), MCP as fallback. Skills are self-documenting.

### Resolution Table

| Tag | Domain | Primary Tool | Fallback | Skill/Reference |
|-----|--------|-------------|----------|-----------------|
| `[TMS_TOOL]` | Test Management | `/xray-cli` skill (if Modality A) | `[ISSUE_TRACKER_TOOL]` (if Modality B — Jira-native, no Xray) | `.claude/skills/xray-cli/` + `test-documentation/SKILL.md` §Phase 0 |
| `[ISSUE_TRACKER_TOOL]` | Issue Tracking | `/acli` skill (Atlassian CLI) | MCP Atlassian | `.claude/skills/acli/` |
| `[AUTOMATION_TOOL]` | Browser Automation | `/playwright-cli` skill | MCP Playwright | `.claude/skills/playwright-cli/` |
| `[DB_TOOL]` | Database | DBHub MCP | Supabase MCP / raw SQL | MCP tool list |
| `[API_TOOL]` | API Exploration | OpenAPI MCP | Postman / curl | MCP tool list |

**Resolution flow**: Skill uses `[TAG_TOOL]` -> AI reads this table for WHICH tool -> reads skill/MCP docs for HOW -> if unavailable, try fallback -> if all unavailable, inform user.

**TMS modality fallback**: `[TMS_TOOL]` behavior depends on the TMS modality resolved by `test-documentation/SKILL.md` §Phase 0.
- **Modality A (Xray on Jira)**: `[TMS_TOOL]` -> `/xray-cli` skill for Xray-specific entities (Test Plan, Test Execution, Test Runs, Pre-Condition) + `[ISSUE_TRACKER_TOOL]` for generic Jira operations.
- **Modality B (Jira-native, no Xray)**: `[TMS_TOOL]` is **not resolvable** — all TMS operations fall through to `[ISSUE_TRACKER_TOOL]` (`/acli` skill). ATP/ATR live as Story custom fields + comment mirrors; TCs live as Jira `Test` issues. See `test-documentation/references/jira-setup.md` for setup.

When a skill writes `[TMS_TOOL] Create Execution`, that call is only valid in Modality A. In Modality B, follow the parallel pseudocode branch in the same skill's references (always labeled "Modality B — Jira-native").

### Pseudocode Syntax

Format: `[TAG_TOOL] Action:` with parameters using these value types:
- **Literal value** (`type: Manual`) -- fixed domain concepts
- **Convention ref** (`{per TC naming convention}`) -- forces AI to consult skill references
- **Project variable** (`{{PROJECT_KEY}}`) -- configured once per project
- **Context-derived** (`{from test analysis}`) -- derived during session

Conventions (TC naming, labeling, bug summary format, execution naming, etc.) live inside the owning skill's `references/` directory. The skill loads them on demand.

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
[User Action] -> [System Process] -> [Outcome]
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

## Orchestration Mode (Subagent Strategy)

**Core Principle**: Main conversation = command center. Subagents = executors.

**Use subagents for**: Reading/writing multiple files, MCP operations, research across repos, git operations, verification (tests/types/lint), multi-file edits.

**Do NOT use subagents for**: Quick lookups, memory reads/writes, task tracking, asking the user, planning.

**Briefing format** -- every dispatch must include:
1. **Goal**: One-sentence description
2. **Context docs**: Which files to read first
3. **Skills to load**: Which skills the subagent needs (e.g., `/playwright-cli`)
4. **Exact instructions**: Step-by-step, not vague goals
5. **Report format**: What to return (files changed, tests passed/failed, blockers)
6. **Rules**: Relevant Critical Rules to follow

### Execution Patterns

| Pattern | When | Example |
|---------|------|---------|
| **Parallel** | Independent tasks | Read 3 context files simultaneously |
| **Sequential** | Dependent tasks | Plan -> Code -> Test |
| **Background** | Long-running | Test suite execution while planning next ticket |
| **Single** | Simple task | One file edit with verification |

**Error protocol**: On subagent error -- STOP, report to user with full context, do NOT fix without approval, present options (retry/skip/abort).

**Planning**: Present plan -> wait for approval -> track progress -> report results.

---

## Skills Available

> All workflows live in `.claude/skills/`. Skills auto-load their own operational detail (phases, references, checklists). Invoke by trigger phrase.

| Skill | Trigger | Purpose |
|-------|---------|---------|
| **project-discovery** | `/project-discovery` | Onboard a project to this boilerplate. 4-phase discovery (Constitution -> Architecture -> Infrastructure -> Specification) that generates PRD, SRS, domain glossary, and orchestrates the `/business-*-map` and `/master-test-plan` commands. Adapts KATA to the target stack. Setup / rediscovery. |
| **sprint-testing** | `/sprint-testing` | Orchestrate in-sprint manual QA per ticket across **Stages 1-3** (Planning, Execution, Reporting). Single-ticket or batch-sprint mode. Produces PBI folder, ATP, ATR, QA comment, bug reports. |
| **test-documentation** | `/test-documentation` | **Stage 4**. Analyze, prioritize (ROI) and document test cases in the TMS (Jira/Xray). Bridge between manual QA and automation. Four scopes: module / ticket / bug / ad-hoc. Produces Candidate / Manual / Deferred verdicts. |
| **test-automation** | `/test-automation` | **Stage 5**. Plan -> Code -> Review automated tests on KATA + Playwright + TypeScript. Three planning scopes (module, ticket, ATC). Writes E2E and API/integration tests, registers fixtures, enforces KATA compliance. |
| **regression-testing** | `/regression-testing` | **Stage 6**. Execute regression / smoke / sanity suites via CI/CD, classify failures (REGRESSION / FLAKY / KNOWN / ENVIRONMENT / NEW TEST), compute pass-rate and trend metrics, emit GO / CAUTION / NO-GO verdict + stakeholder report. |
| **playwright-cli** | `/playwright-cli` | Browser automation CLI: screenshots, tracing, video recording, session management, request mocking, test generation. |
| **xray-cli** | `/xray-cli` | Xray Cloud test management CLI: create tests, manage executions and plans, import JUnit/Cucumber/Xray JSON results, back up and restore project data. |

**Decision Tree:**

| Need | Tool |
|------|------|
| Onboard a new repo / regenerate context | `/project-discovery` |
| Test a user story or retest a bug | `/sprint-testing` |
| Create TMS artifacts, ROI, traceability | `/test-documentation` |
| Write or review automated tests | `/test-automation` |
| Run regression, decide release | `/regression-testing` |
| Browser interaction | `/playwright-cli` |
| Xray/TMS CLI operation | `/xray-cli` |
| API exploration | OpenAPI MCP |
| Database query | DBHub MCP |
| Library docs | Context7 MCP |
| Community solutions | Tavily MCP |

Skills are committed to the repo. User-specific settings (`.claude/settings.local.json`) are gitignored.

---

## Commands Available

> Single-file utilities under `.claude/commands/`. Invoke with `/<command-name>`.

| Command | Purpose |
|---------|---------|
| `/refresh-ai-memory` | Regenerate `README.md` and the AI memory file (`CLAUDE.md` / `GEMINI.md` / `AGENTS.md` / `.cursor/rules` / etc., auto-detected) so they reflect the current `.context/` and `package.json` state. Run when documentation drifts. |
| `/business-data-map` | Generate or refresh `.context/mapping/business-data-map.md` (entities, flows, state machines). |
| `/business-feature-map` | Generate or refresh `.context/mapping/business-feature-map.md` (feature catalog, CRUD matrix, integrations). |
| `/test-execution-breakdown` | Plain-English breakdown of automated tests for a given module / spec. |
| `/traceability-fix` | Repair broken US-ATP-ATR-TC traceability links in the TMS. |
| `/git-flow`, `/git-conflict-fix` | Git workflow helpers. |

---

## Fundamental Rules (Always in Memory)

> Quick-reference summary. Detailed patterns live inside the `test-automation` skill's `references/` directory, loaded on demand.

### TypeScript Patterns

| Pattern | Rule |
|---------|------|
| **Parameters** | Max 2 positional. 3+ -> use object parameter |
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

### KATA Architecture

```
TestContext (Layer 1) - Config, Faker, utilities
    | extends
ApiBase / UiBase (Layer 2) - HTTP / Playwright helpers
    | extends
YourApi / YourPage (Layer 3) - ATCs live here
    | used by
TestFixture (Layer 4) - Dependency injection
    | used by
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

**Example**: `git checkout -b feature/UPEX-123-add-login-tests` -> commit -> push with `-u` -> `gh pr create --base staging`. For general work on `main`, always ask "Confirm push to main?" before pushing.

---

## Context System

### Level 1: Project-Wide (generated by `/project-discovery` + `/business-*-map` + `/master-test-plan`)

```
.context/mapping/business-data-map.md     -> System flows and entities              (/business-data-map)
.context/mapping/business-feature-map.md  -> Feature catalog, CRUD matrix, flags    (/business-feature-map)
.context/mapping/business-api-map.md      -> Auth model, critical endpoints, arch   (/business-api-map)
.context/master-test-plan.md              -> What to test and why                   (/master-test-plan)
.context/test-management-system.md        -> TMS architecture + conventions + workflow
api/schemas/                              -> OpenAPI-derived TypeScript types       (bun run api:sync)
```

### Level 2 + 3: PBI (per module / per ticket)

```
.context/PBI/{module}/
  module-context.md                            -> Module overview
  test-specs/
    ROADMAP.md                                 -> All tickets + automation status
    PROGRESS.md                                -> Current progress
    {PREFIX}-T{id}-{name}/
      spec.md                                  -> Test specification
      implementation-plan.md                   -> Automation plan
      atc/*.md                                 -> Individual ATC designs
```

**Living examples**: API components in `tests/components/api/*Api.ts`, UI components in `tests/components/ui/*Page.ts`, tests in `tests/e2e/` or `tests/integration/`.

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

## AI Behavior

**Workflow**: Plan first (wait for approval) -> delegate to subagents -> use skills -> track progress -> report results -> verify quality.

### During Testing

1. **Explain the story**: Once you understand the ticket, explain briefly:
   - What the feature is about
   - How it works (in simple terms)
   - What we will be testing

2. **Wait for confirmation**: After important explanations, WAIT for the user to respond before continuing. This allows the user to:
   - Read and understand
   - Ask questions if needed
   - Confirm whether to proceed

3. **Explain defects**: When you find a bug or unexpected behavior:
   - Describe what you observed
   - Explain why it is a problem
   - Suggest the impact (severity, affected users, business risk)

4. **Language**: Default to **English**. If the user writes in another language, mirror that language for user-facing communication. Documentation and code are always written in English.

### Environment Selection

Default to **staging** unless the user specifies otherwise. Ask when ambiguous. Use URLs from "Environment URLs" table and credentials from `.env`.

### Context Efficiency

Main conversation stays lean (no large file reads). Subagents do heavy reading. Skills load only the references the current phase needs.

---

## Local Context (PBI)

For every ticket being tested, maintain local documentation under `.context/PBI/`:

```
.context/PBI/{module-name}/{TICKET-ID}-{brief-title}/
  context.md          # Main file: ACs, test data, session notes, open questions
  test-analysis.md    # Test plan / Acceptance Test Plan (ATP) mirror
  test-report.md      # Test report / Acceptance Test Report (ATR) mirror
  evidence/           # Screenshots, traces, logs (gitignored)
```

**Variables**: `{module-name}` = kebab-case module (e.g., `user-management`), `{TICKET-ID}` = TMS identifier (e.g., `UPEX-277`), `{brief-title}` = max ~5 words kebab-case (e.g., `empty-states`).

**Entry point**: invoke `/sprint-testing` -- it fetches the ticket, explains the story, loads context, explores code, creates the PBI folder.

**Resume a session**: invoke `/test-automation` (or describe the task in natural language). The skill reads `PROGRESS.md` + `ROADMAP.md` automatically and picks up where the last session left off -- no static prompt file needed.

---

## CLI Tools

| Script | Usage | Documentation |
|--------|-------|---------------|
| `bun xray` | TMS sync (import/export/sync) | `cli/xray.ts` (self-documented) |
| `bun run api:sync` | Sync OpenAPI spec + generate types | `cli/sync-openapi.ts` |
| `bun run kata:manifest` | Extract ATCs from codebase | See `package.json` |

**Run `bun <script> --help`** for usage details.

---

## Test Project Structure

```
tests/
  components/
    TestContext.ts        # Layer 1: Config + Faker
    TestFixture.ts        # Layer 4: Unified fixture
    api/
      ApiBase.ts          # Layer 2: HTTP client
      [YourApi.ts]        # Layer 3: Domain components
    ui/
      UiBase.ts           # Layer 2: Page base
      [YourPage.ts]       # Layer 3: Domain components
    steps/                # Reusable step chains (preconditions)
  e2e/                    # E2E tests
  integration/            # API tests
  data/fixtures/          # Test data JSON
```

---

## Quick Reference

**Pre-flight checklist:**

- [ ] Plan presented and approved before coding
- [ ] KATA architecture followed (layers, ATCs, fixtures)
- [ ] Aliases used for imports (`@api/`, `@schemas/`, `@utils/`)
- [ ] Credentials from `.env`, never hardcoded
- [ ] Tests run and pass
- [ ] No AI attribution in commits
- [ ] Context loaded progressively (not all at once)

See "Quick Start" above for common test commands.

---

*Update this file when skills, core rules, or workflow patterns change.*
