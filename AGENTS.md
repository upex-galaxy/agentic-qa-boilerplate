# Project Memory

> Operational context loaded every AI session. Replace `[PLACEHOLDER]` values with your project specifics.

> **Source-of-truth mirror**: this file is mirrored at `.claude/skills/framework-core/templates/AGENTS.md.template`. Structural changes here MUST be applied to both. Project-specific facts (Project Identity, Environment URLs, Discovery Progress, Access Configuration) are refreshed by `/refresh-ai-memory` and do NOT belong in the template.

---

## Quick Start

This project is driven by **agent skills**. Each skill owns an end-to-end slice of the QA lifecycle and self-loads its own operational detail. Invoke a skill by its trigger phrase (e.g. "run regression", "write E2E test", "document these tests", "onboard this repo") and the matching skill will take over.

The Stages 1-6 pipeline is distributed across skills:

- **Stages 1-3** (plan, execute, report per ticket) -> `/sprint-testing`
- **Stage 4** (TMS documentation + ROI) -> `/test-documentation`
- **Stage 5** (automation: plan, code, review) -> `/test-automation`
- **Stage 6** (regression, GO/NO-GO) -> `/regression-testing`
- **Project setup / onboarding** -> `/project-discovery` (discovery) + `/adapt-framework` (KATA adaptation)

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

Project-specific values (paths, URLs, project key, DB names, MCP servers, issue tracker metadata, etc.) are declared in **`.agents/project.yaml`**. Before resolving any `{{VAR_NAME}}` in any skill, command, template or doc, read `.agents/project.yaml` once per session and cache the values.

Variable syntaxes that exist and must not be confused:

- `{{VAR_NAME}}` — **project variable**, static per-repo value; resolves to `.agents/project.yaml` (snake_case key; `{{PROJECT_NAME}}` → `project.project_name`).
  - **Flat vars** live at top-level sections (e.g. `{{PROJECT_KEY}}` → `project.project_key`, `{{JIRA_URL}}` → `issue_tracker.jira_url`).
  - **Env-scoped vars** (`{{WEB_URL}}`, `{{API_URL}}`, `{{DB_MCP}}`, `{{API_MCP}}`) resolve to `environments[active_env].<var>` — where `active_env` is the env the user explicitly chose for this session, falling back to `testing.default_env`. If the user says "test against production", switch `active_env` to `production` for that session and ignore `default_env` until the session ends.
  - For explicit cross-env references (rare; only in multi-env documents), use `{{environments.<env>.<var>}}` (e.g. `{{environments.local.web_url}}`).
- `<<VAR_NAME>>` — **session variable**, computed at runtime by the command that uses it (e.g. `<<ISSUE_KEY>>` extracted from the git branch name); never persisted.
- `{{jira.<slug>}}` — **Jira custom field reference**, resolves to `.agents/jira-fields.json` via `.agents/jira-required.yaml`. Sub-forms: `{{jira.<slug>.<option>}}` for plain `option` / array-of-option fields, `{{jira.<slug>.<parent>.<child>}}` for cascading `option-with-child`. See `.agents/README.md` for the full convention.
- `{{jira.work_type.<slug>}}` / `{{jira.status.<work_type>.<slug>}}` / `{{jira.transition.<work_type>.<slug>}}` — **Jira workflow references**. `work_type` resolves to the literal issue-type name (e.g. `"Story"`); `status` resolves to the literal status name (sub-keys: `.id`, `.category`); `transition` resolves to the transition `id` (sub-key: `.name`) — use the id form to invoke transitions unambiguously via REST. All resolve to `.agents/jira-workflows.json` via `.agents/jira-required.yaml` `work_types:`. See `.agents/README.md` for the full convention.

---

## Tool Resolution

> When skills use `[TAG_TOOL]` pseudocode, resolve to the actual tool using this table.
> **Priority**: CLI tools first (fewer tokens), MCP as fallback. Skills are self-documenting.

### Resolution Table

| Tag | Domain | Primary Tool | Fallback | Skill/Reference |
|-----|--------|-------------|----------|-----------------|
| `[ISSUE_TRACKER_TOOL]` | Issue Tracking (Project Management: Jira Cloud, story/bug/epic) | `/acli` skill (Atlassian CLI) | MCP Atlassian | `.claude/skills/acli/` |
| `[TMS_TOOL]` | Test Management (Xray or Jira-native: Test/Test Plan/Test Execution) | Modality A: `/xray-cli` skill. Modality B: `/acli` skill (Jira-native, no Xray plugin) | MCP Atlassian | `.claude/skills/xray-cli/` + `.claude/skills/acli/` + `test-documentation/SKILL.md` §Phase 0 |
| `[AUTOMATION_TOOL]` | Browser Automation | `/playwright-cli` skill | MCP Playwright | `.claude/skills/playwright-cli/` |
| `[DB_TOOL]` | Database | DBHub MCP | Supabase MCP / raw SQL | MCP tool list |
| `[API_TOOL]` | API Exploration | OpenAPI MCP | Postman / curl | MCP tool list |

### Regla crítica: cargar la skill antes de invocar la herramienta

Las skills de testing (`sprint-testing`, `test-documentation`, `regression-testing`, etc.) solo contienen el **CUÁNDO** y el **QUÉ** (acción de alto nivel usando el tag pseudocode: `[ISSUE_TRACKER_TOOL] Create Issue: ...`). El **CÓMO** (sintaxis concreta, flags, auth, paginación, manejo de errores) vive exclusivamente dentro de las skills propietarias de cada herramienta.

**Obligatorio**:

- Antes de ejecutar cualquier `[ISSUE_TRACKER_TOOL] ...` -> cargar la skill `/acli` (o MCP Atlassian si acli no está disponible).
- Antes de ejecutar cualquier `[TMS_TOOL] ...` en Modalidad A -> cargar la skill `/xray-cli`.
- Antes de ejecutar cualquier `[TMS_TOOL] ...` en Modalidad B -> cargar la skill `/acli` (las operaciones TMS se mapean a operaciones Jira nativas).

Nunca invoques `acli`, `xray` ni ningún comando concreto sin haber cargado primero su skill propietaria. Las skills invocadoras no duplican el CÓMO -- es responsabilidad del agente consultar la skill propietaria al resolver el tag.

**Resolution flow**: Skill uses `[TAG_TOOL]` -> AI reads this table for WHICH tool -> reads skill/MCP docs for HOW -> if unavailable, try fallback -> if all unavailable, inform user.

**TMS modality fallback**: `[TMS_TOOL]` behavior depends on the TMS modality resolved by `test-documentation/SKILL.md` §Phase 0.
- **Modality A (Xray on Jira)**: `[TMS_TOOL]` -> `/xray-cli` skill for Xray-specific entities (Test Plan, Test Execution, Test Runs, Pre-Condition) + `[ISSUE_TRACKER_TOOL]` for generic Jira operations.
- **Modality B (Jira-native, no Xray)**: `[TMS_TOOL]` is **not resolvable** — all TMS operations fall through to `[ISSUE_TRACKER_TOOL]` (`/acli` skill). ATP/ATR live as Story custom fields + comment mirrors; TCs live as Jira `Test` issues. See `test-documentation/references/jira-setup.md` for setup.

**Branch por modalidad**: Skills que usan `[TMS_TOOL]` en su pseudocode (como `test-documentation`, `sprint-testing`) **deben** incluir ramas alternativas para ambas modalidades. La rama Modalidad A usa pseudocode `[TMS_TOOL]` contra `/xray-cli`; la rama Modalidad B reescribe las mismas acciones como `[ISSUE_TRACKER_TOOL]` contra `/acli`, mapeando entidades Xray a sus equivalentes Jira-native (ver `test-documentation/references/jira-setup.md`).

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

### Skill Compliance

Workflow skills (`sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`) MUST declare their dispatch points and use the canonical 6-component briefing.

| Resource                                                              | Purpose                                                |
|------------------------------------------------------------------------|--------------------------------------------------------|
| `.claude/skills/framework-core/references/briefing-template.md`        | The 6-component briefing format + 1 example per pattern|
| `.claude/skills/framework-core/references/dispatch-patterns.md`        | Decision guide: when to Single / Parallel / Sequential / Background |
| `.claude/skills/framework-core/references/orchestration-doctrine.md`   | Cacheable mirror of this section, for subagents to load without pulling full AGENTS.md |

**Mandatory in workflow skills**: every `SKILL.md` must contain a `## Subagent Dispatch Strategy` section with a table mapping each stage to its pattern and subagent role.

**Exempt** (reference / utility / generator skills, do NOT need a dispatch table): `framework-core`, `acli`, `xray-cli`, `playwright-cli`, `playwright-best-practices`, `project-discovery`, `adapt-framework`, `business-data-map`, `business-feature-map`, `business-api-map`, `master-test-plan`, `break-down-tests`, `fix-traceability`, `commit-push-pr`, `refresh-ai-memory`, `fix-git-conflict`.

---

## Skills Available

> All workflows live in `.claude/skills/`. Skills auto-load their own operational detail (phases, references, checklists). Invoke by trigger phrase.

| Skill | Trigger | Purpose |
|-------|---------|---------|
| **framework-core** | `/framework-core init` | Foundation skill: hosts shared references cited by workflow skills (briefing template, dispatch patterns, orchestration doctrine) AND bootstraps the boilerplate's foundation files (AGENTS.md, .agents/, scripts/, package.json) for downstream consumers. |
| **project-discovery** | `/project-discovery` | Onboard a project to this boilerplate. 4-phase discovery (Constitution -> Architecture -> Infrastructure -> Specification) that generates PRD, SRS, domain glossary, and orchestrates the `/business-*-map` and `/master-test-plan` commands. Reverse-engineering only — for KATA adaptation run `/adapt-framework` afterwards. |
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
| Adapt this boilerplate's `tests/` to the target stack after discovery | `/adapt-framework` |
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
| `/adapt-framework` | Adapt this boilerplate's KATA test architecture (`tests/`, `api/schemas/`, `config/`) to a project already reverse-engineered by `/project-discovery`. Two sub-phases: Plan (no writes) -> user approval -> Implement (writes). Modifies THIS repo only. |
| `/refresh-ai-memory` | Regenerate `README.md` and the AI memory file (`CLAUDE.md` / `GEMINI.md` / `AGENTS.md` / `.cursor/rules` / etc., auto-detected) so they reflect the current `.context/` and `package.json` state. Run when documentation drifts. |
| `/business-data-map` | Generate or refresh `.context/mapping/business-data-map.md` (entities, flows, state machines). |
| `/business-feature-map` | Generate or refresh `.context/mapping/business-feature-map.md` (feature catalog, CRUD matrix, integrations). |
| `/break-down-tests` | Plain-English breakdown of automated tests for a given module / spec. |
| `/fix-traceability` | Repair broken US-ATP-ATR-TC traceability links in the TMS. |
| `/commit-push-pr`, `/fix-git-conflict` | Git workflow helpers. |

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

Protected branches:

| Branch | Role |
|---|---|
| `main` | Production. PRs merged from `staging` or a semantic branch after review. |
| `staging` | Integration branch for AI commits and pre-release validation. |

Task branches follow the **same semantic vocabulary as commits** — the prefix announces the contract of the work. Pick the prefix that matches the *dominant* change (weight: `feat` > `fix` > `refactor` > `test` > `docs` > `chore`).

| Prefix | Use when the dominant change is… | Example |
|---|---|---|
| `feat/` | A new feature or capability | `feat/UPEX-123-bulk-assign-users` |
| `fix/` | A bug fix | `fix/UPEX-45-empty-reservation-list` |
| `test/` | Writing or updating automated tests (no product-code changes) | `test/UPEX-277-login-smoke-tests` |
| `docs/` | Documentation only | `docs/UPEX-310-clarify-kata-fixtures` |
| `refactor/` | Code change without behaviour change | `refactor/split-kata-fixtures` |
| `chore/` | Tooling, config, deps, housekeeping | `chore/bump-playwright-1.50` |

Name format: `{prefix}/{ISSUE-KEY}-{kebab-slug}` when an issue key exists, `{prefix}/{kebab-slug}` otherwise.

### Commit Rules

- **Semantic prefixes**: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`
- **One commit = one responsibility**
- **Clear messages**: Someone should understand the change without reading the diff
- **NO AI attribution**: Never include "Generated with Claude Code", "Co-Authored-By: Claude", or similar lines. Commits must look human-authored.
- **Confirm before push to main**: Always ask user confirmation before pushing to `main`.

### Pull Requests

- Test-automation PRs use `templates/pr-test-automation.md`. `/commit-push-pr` loads and fills this template automatically.
- Title format: `{type}({ISSUE-KEY}): {description}` — include the issue key whenever one exists. Fallback: `{type}: {description}`.
- Branch names follow the semantic prefix vocabulary documented in the Branch Strategy table above.
- The template body is intentionally NOT inlined here; it lives in `templates/` so it can evolve without bloating `AGENTS.md` / `CLAUDE.md`.

**Example**: `git checkout -b test/UPEX-123-add-login-tests` -> commit -> push with `-u` -> `gh pr create --base staging`. For general work on `main`, always ask "Confirm push to main?" before pushing.

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
| `bun run api:sync` | Sync OpenAPI spec + generate types | `scripts/sync-openapi.ts` |
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
