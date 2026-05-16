# Agentic QA Boilerplate

> Skills-based AI workflows for the full QA lifecycle, built on Playwright + KATA + TypeScript.

[![Playwright Tests](https://img.shields.io/badge/Playwright-1.58+-green?logo=playwright)](https://playwright.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-black?logo=bun)](https://bun.sh/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Start here — pick your path

| Goal | What to read / run |
|------|-------------------|
| **Start a new project — magic command (recommended)** | `bunx create-agentic-qa <your-repo-name>` — official scaffolder ([npm](https://www.npmjs.com/package/create-agentic-qa)) |
| **Start a new project — GitHub "Use this template"** | Click [**Use this template**](https://github.com/upex-galaxy/agentic-qa-boilerplate/generate) → clone your new repo → `bun install && bun run setup` (see [Use this template](#use-this-template-github)) |
| **Contribute to the boilerplate itself** | `git clone …` then `bun install && bun run setup` (see [Manual clone](#manual-clone-contributors)) |
| **Get oriented before installing** | Open [`docs/onboarding.html`](docs/onboarding.html) in browser, or `bun run onboarding` |
| **Understand the methodology** | [`docs/agentic-quality-engineering.md`](docs/agentic-quality-engineering.md) |
| **See what `bun run setup` configures** | [`INSTALLER.md`](INSTALLER.md) — run `bun cli/doctor.ts` after setup |
| **I'm an AI agent loading this repo** | `CLAUDE.md` (auto-loaded each session) |

> **Recommended path: the magic command.** `bunx create-agentic-qa <your-repo-name>` is the official scaffolder — it downloads the latest template, scrubs upstream git history, auto-renames `package.json` + `.agents/project.yaml`, runs `bun install`, hands off to `bun run setup`, and can optionally create a GitHub repo for you via `gh`. The GitHub "Use this template" flow is a fine fallback when you prefer GitHub-native repo creation. The **Manual clone** path is for contributors hacking on the boilerplate itself — end-users should NOT clone manually.

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

## Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- Node.js 18+ (for some Playwright features)
- `git`, `tar` (consumed by the scaffolder)
- (optional) [`gh`](https://cli.github.com/) — for one-shot GitHub repo creation at the end of `bun run setup`

---

## Scaffold a new project

The fastest and recommended path. One command bootstraps a fresh QA project from the latest `main`:

```bash
bunx create-agentic-qa <your-repo-name>
cd <your-repo-name>
```

What `bunx create-agentic-qa` does end-to-end:

1. Downloads the latest `upex-galaxy/agentic-qa-boilerplate` `main` as a tarball — no upstream git history.
2. Extracts into `./<your-repo-name>/`, then rewrites `package.json#name` and `.agents/project.yaml#project.name`.
3. Initializes a fresh `git init -b main` and creates the initial commit.
4. Runs `bun install`.
5. Hands off to `bun run setup` — the interactive installer (gentle-ai, 14 skills, 9 community skills, 7 MCPs, `.env`, direnv, optional `gh repo create`).

### Useful flags

| Flag | Default | Description |
|------|---------|-------------|
| `<project-name>` | required | Target directory name (skip when using `--here`). |
| `--here` | off | Bootstrap into the current directory, or skip download if already inside a bootstrapped project. |
| `--template <ref>` | `main` | Branch / tag / SHA of the template repo to download. |
| `--template-repo <owner/repo>` | `upex-galaxy/agentic-qa-boilerplate` | Override the upstream repository (useful for forks). |
| `--project-key <KEY>` | prompted | Jira project key (e.g. `UPEX`). |
| `--no-install` | off | Skip `bun install`. |
| `--no-setup` | off | Skip `bun run setup` — download + git init only. |
| `--non-interactive` | auto on no-TTY | Forwarded to the installer. Prompts use safe defaults. |

Full flag reference: [`packages/create-agentic-qa/README.md`](packages/create-agentic-qa/README.md).

### Optional follow-ups

```bash
# Visual orientation (single-file HTML, sidebar nav). Do NOT chain with setup — server is blocking.
bun run onboarding

# Polish the Claude Code status line — open in a SEPARATE terminal window with NO agent session running.
bunx -y ccstatusline@latest
```

OpenCode users get the equivalent polish automatically — `opencode.jsonc` ships with the `opencode-subagent-statusline` plugin enabled.

### QA workflow slash commands (per-project)

After setup, drive the QA lifecycle inside the agent:

- `/agentic-qa-onboard` — first-time orientation tour.
- `/project-discovery` — reverse-engineer the target app into `.context/`.
- `/sprint-testing` — in-sprint manual QA per ticket (planning + execution + reporting).
- `/test-documentation` — TMS docs + ROI prioritization (Candidate / Manual / Deferred).
- `/test-automation` — KATA Plan → Code → Review.
- `/regression-testing` — CI execution + GO / CAUTION / NO-GO decision.

---

## Use this template (GitHub)

GitHub-native template flow. No tarball, no auto-rename, no automatic `bun install`:

1. Click [**Use this template**](https://github.com/upex-galaxy/agentic-qa-boilerplate/generate) on the repo page and create your new GitHub repo.
2. Clone YOUR new repo locally:

   ```bash
   git clone https://github.com/<you>/<your-repo-name>.git
   cd <your-repo-name>
   ```

3. Install dependencies + run the interactive setup:

   ```bash
   bun install
   bun run setup
   ```

4. Manually rename `package.json#name` and `.agents/project.yaml#project.name` to your project name (the scaffolder does this for you; this template flow does not).

> **Strongly recommended: use the magic command instead.** `bunx create-agentic-qa <your-repo-name>` does everything this flow does PLUS scrubbing upstream git history, auto-renaming `package.json` + `.agents/project.yaml`, running `bun install`, driving the installer, and optionally creating a GitHub repo for you via `gh repo create` — none of which happens with the GitHub template flow.

---

## Manual clone (contributors)

This path is for contributors hacking on the boilerplate itself. End-users should use the scaffolder above.

```bash
# 1. Clone the repository
git clone https://github.com/upex-galaxy/agentic-qa-boilerplate.git
cd agentic-qa-boilerplate

# 2. Install dependencies
bun install

# 3. Install Playwright browsers
bun run pw:install

# 4. Copy env template
cp .env.example .env   # then fill in the values

# 5. (Optional) Visual orientation — close tab + Ctrl-C when done.
bun run onboarding

# 6. Run the interactive setup (gentle-ai, skills, MCPs, .env, direnv)
bun run setup

# 7. Validate the install
bun cli/doctor.ts
```

> If you are NOT contributing to the boilerplate itself, do NOT clone manually — use `bunx create-agentic-qa <your-repo-name>` instead. The scaffolder is the supported end-user entry point.

### Polish your Claude Code status line (optional, recommended)

After `bun run setup` succeeds, run the [`ccstatusline`](https://github.com/sirmalloc/ccstatusline) configurator to customize the Claude Code terminal status line (model, token usage, context %, git branch, etc.):

```bash
bunx -y ccstatusline@latest
```

> ⚠️ Run this in a **plain terminal window with no agent session running**. `ccstatusline` opens an interactive TUI configurator that needs full control of the terminal — launching it from inside an active Claude Code (or OpenCode) session will collide with the agent's own TUI.

OpenCode users get the equivalent polish automatically: this repo's `opencode.jsonc` ships with the `opencode-subagent-statusline` plugin enabled, which surfaces the active subagent in the OpenCode status line out of the box.

---

## Launching the agent

`.mcp.json` (Claude Code) and `opencode.jsonc` are committed with `${VAR}` / `{env:VAR}` expansion — real values live in `.env`. Launch the agent via one of these paths so the env vars get loaded:

```bash
# Cross-platform default (uses dotenv-cli, no extra tooling required):
bun run claude        # Claude Code
bun run opencode      # OpenCode

# Optional: direnv autoload (any OS with direnv installed)
direnv allow          # one-time per repo (the installer offers to run this)
claude                # direct binary picks up .env from your shell
```

direnv works on macOS / Linux / Windows. On Windows install via `winget install direnv` — Git Bash is recommended; PowerShell support is experimental and requires direnv 2.37+. See [INSTALLER.md § Launching the agent](./INSTALLER.md#launching-the-agent-after-setup) for the per-shell hook lines.

---

## Configuration

This boilerplate has **two configuration systems** that serve different consumers and must not be conflated:

| System | File | Consumer | Loaded at |
|--------|------|----------|-----------|
| **Runtime test config** | `.env` + `config/variables.ts` | Playwright runner, KATA components, `bun run *` scripts (jiraSync, env validate, etc.) | Test execution time |
| **AI context engineering** | `.agents/project.yaml` | Claude Code, Codex, Cursor, Copilot, OpenCode — used to resolve `{{VAR}}` references in skills, commands, and templates | AI session bootstrap |

Both are needed. Skip neither.

### (a) Runtime test config — `.env`

Edit `.env` with your project values:

```bash
# Environment selector (valid: local, staging)
TEST_ENV=local

# Test User Credentials (only the current TEST_ENV is required)
LOCAL_USER_EMAIL=
LOCAL_USER_PASSWORD=
STAGING_USER_EMAIL=your-test-user@example.com
STAGING_USER_PASSWORD=your-password

# Browser Configuration (optional — defaults shown)
HEADLESS=true
DEFAULT_TIMEOUT=30000

# TMS Integration (optional — only if AUTO_SYNC=true)
TMS_PROVIDER=xray
AUTO_SYNC=false
XRAY_CLIENT_ID=
XRAY_CLIENT_SECRET=
XRAY_PROJECT_KEY=
```

### (b) Runtime URLs — `config/variables.ts`

Update `envDataMap` in `config/variables.ts` with your application URLs. The `Environment` type currently accepts `local` and `staging`; extend the type when you need a third environment.

```typescript
const envDataMap: Record<
  Environment,
  { base: string; api: string; user: { email: string; password: string } }
> = {
  local: {
    base: 'http://localhost:3000',
    api: 'http://localhost:3000/api',
    user: userCredentialsMap.local,
  },
  staging: {
    base: 'https://staging.yourapp.com',
    api: 'https://staging.yourapp.com/api',
    user: userCredentialsMap.staging,
  },
};
```

### (c) AI context engineering — `.agents/project.yaml`

The AI agents (Claude Code, Codex, Cursor, Copilot, OpenCode) resolve `{{VAR}}` references in skills, templates, and commands against `.agents/project.yaml`. Edit it manually, or run the interactive walkthrough:

```bash
bun run agents:setup
```

This populates `project.project_name`, `project.project_key`, `issue_tracker.jira_url`, `environments.<env>.web_url`, `environments.<env>.api_url`, `environments.<env>.db_mcp`, `environments.<env>.api_mcp`, and the rest. See `.agents/README.md` for the full convention.

---

## Run Tests

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
│   │   └── steps/                # Reusable ATC chains (preconditions)
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
│   ├── variables.ts              # Runtime env vars consumed by Playwright/KATA
│   └── validateEnv.ts            # Environment validation
│
├── .context/                     # AI Context Engineering (generated)
│   ├── business/                  # business-data-map / business-feature-map / business-api-map
│   ├── master-test-plan.md       # What to test and why
│   ├── test-management-system.md # TMS architecture + conventions + workflow
│   ├── PRD/                      # Product requirements
│   ├── SRS/                      # Technical specs
│   └── PBI/                      # Per-ticket backlog items
│
├── .agents/                      # Agentskills.io spec layout
│   ├── project.yaml              # AI context vars (resolved as {{VAR}} by skills)
│   ├── jira-fields.json                 # Jira custom-field catalog (synced by `bun run jira:sync-fields`)
│   ├── jira-required.yaml        # Required Jira custom-field manifest
│   ├── README.md                 # Variable conventions reference
│   └── skills/                   # Symlink → .claude/skills/ (agentskills.io path)
│
├── .claude/skills/               # Claude Code Skills (workflows)
│   ├── agentic-qa-core/           # Foundation: passive reference host (briefing template, dispatch patterns, orchestration doctrine)
│   ├── project-discovery/        # Onboarding + context generation
│   ├── sprint-testing/           # Planning + execution + reporting
│   ├── test-documentation/       # TMS documentation + prioritization
│   ├── test-automation/          # KATA planning + coding + review
│   ├── regression-testing/       # Regression execution + GO/NO-GO
│   ├── xray-cli/                 # Xray TMS helper
│   └── acli/                     # Atlassian CLI helper ([ISSUE_TRACKER_TOOL])
│
├── .github/workflows/            # CI/CD pipelines
│   ├── build.yml                 # PR validation
│   ├── smoke.yml                 # Daily smoke tests
│   ├── sanity.yml                # Pattern-based tests
│   └── regression.yml            # Full regression
│
├── docs/                         # Human-facing docs
│   ├── architectures/            # Architecture references
│   ├── methodology/              # QA methodology
│   ├── setup/                    # Setup guides
│   ├── testing/                  # Testing documentation
│   └── workflows/                # Workflow documentation
│
├── packages/
│   └── create-agentic-qa/        # Official npm scaffolder (bunx create-agentic-qa <your-repo-name>) — own README + tests
│
├── cli/                          # install.ts, doctor.ts, update-boilerplate.ts consumed by bun scripts
├── templates/                    # Files copied into bootstrapped projects by QA workflow skills
│
├── playwright.config.ts          # Playwright configuration
├── INSTALLER.md                  # Contract for bun run setup — what each installer layer does
├── CLAUDE.md                     # AI memory (canonical, read by Claude Code + OpenCode)
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
| **Step** | Reusable ATC chains | `tests/components/steps/` |

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

See the `/test-automation` skill (`references/kata-architecture.md`) for complete documentation.

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
| `bun run api:sync` | Sync OpenAPI spec and generate types |
| `bun run kata:manifest` | Extract ATCs from codebase into a manifest (`--watch` flag available) |
| `bun run agents:setup` | Interactive walkthrough to populate `.agents/project.yaml` |
| `bun run lint:agents` | Lint `.agents/` files for missing required values |
| `bun run lint:skills` | Validate T1-T4 skill tier coherence (frontmatter, categories, anti-leak) |
| `bun run jira:sync-fields` | Sync Jira custom-field catalog into `.agents/jira-fields.json` |
| `bun run jira:sync-workflows` | Sync Jira workflow statuses + transitions into `.agents/jira-workflows.json` |
| `bun run jira:sync-issues` | Pull Jira Epics/Stories into `.context/PBI/` markdown files |
| `bun run jira:check` | Verify Jira workspace has required custom fields configured |

---

## Keeping your project in sync with the boilerplate

The `bun run update` CLI keeps your project aligned with the official template by tracking which upstream commit each piece of the framework (`skills/`, `scripts/`, `cli/`, …) was last synced from. Instead of overwriting framework files blindly, it:

1. Reads `.boilerplate-version.json` (committed in your repo) to find the last-synced SHA per component
2. Clones the template lazily (sparse checkout, only the dirs that get synced)
3. Computes the exact list of changed files between your synced SHA and template HEAD
4. Classifies each file: clean fast-forward, locally diverged, new upstream, deleted upstream, binary, or whitespace-only
5. In interactive mode: shows you a space-bar checkbox menu with `[M/A/D]` badges and `+N/-M` line counts. For files where you edited locally, shows you both diffs and lets you pick `theirs`, `mine`, or `skip`
6. In `--auto` / CI mode: applies safe changes, skips your edits, never deletes, prints a summary table
7. Writes the new SHA only for components where every changed file was processed (skip = no SHA advance, so a skipped file resurfaces next run)

**Requirements**: git ≥ 2.25 (for partial-clone with `--filter=blob:none`), Bun, GitHub CLI authenticated.

Run interactively:

```bash
bun run update
```

Run non-interactively (for CI):

```bash
bun run update --auto
```

Preview without writing:

```bash
bun run update --dry-run
```

Rollback the latest sync:

```bash
bun run update --rollback
```

The `.boilerplate-version.json` file is committable — commit it so your team and CI know exactly which template version each component is on.

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

Required (only the credentials matching your active `TEST_ENV` are validated):

```yaml
# Environment selection
TEST_ENV                    # local | staging

# Test User Credentials (required for the active TEST_ENV)
LOCAL_USER_EMAIL
LOCAL_USER_PASSWORD
STAGING_USER_EMAIL
STAGING_USER_PASSWORD
```

Optional (only when the corresponding feature is enabled):

```yaml
# Browser
HEADLESS                    # default: true
DEFAULT_TIMEOUT             # default: 30000

# TMS — set TMS_PROVIDER + AUTO_SYNC=true to push results
TMS_PROVIDER                # xray | jira
AUTO_SYNC                   # default: false

# Xray Cloud (required if TMS_PROVIDER=xray AND AUTO_SYNC=true)
XRAY_CLIENT_ID
XRAY_CLIENT_SECRET
XRAY_PROJECT_KEY

# Jira Direct (required if TMS_PROVIDER=jira AND AUTO_SYNC=true)
JIRA_URL
JIRA_USER
JIRA_API_TOKEN
JIRA_TEST_STATUS_FIELD      # default: customfield_10100

# Reporting
ALLURE_RESULTS_DIR          # default: ./allure-results
SCREENSHOT_ON_FAILURE       # default: true
VIDEO_ON_FAILURE            # default: true

# CI/CD (set automatically by GitHub Actions)
CI
BUILD_ID
```

---

## AI-Assisted Development

This boilerplate's AI-assisted workflows are delivered as **agent skills** following the [agentskills.io](https://agentskills.io) spec. Every skill lives under `.claude/skills/` and bundles its own instructions, `references/`, and progressive-disclosure assets, so the AI loads only what the current task needs.

Skills follow the **Orchestration Mode** (main conversation = command center, subagents = executors) defined in `.claude/skills/agentic-qa-core/references/orchestration-doctrine.md`. Workflow skills (`sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`) declare their dispatch points in a `## Subagent Dispatch Strategy` section per skill, citing `agentic-qa-core/references/dispatch-patterns.md` and `agentic-qa-core/references/briefing-template.md`.

Structured project context (`.context/` with `business/`, `PRD/`, `SRS/`, `PBI/`) is generated and maintained by these skills -- you do not hand-author it.

### Complete Adaptation Flow

When you clone this template, follow this flow to adapt it to your project:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. CLONE TEMPLATE                                           │
│    git clone https://github.com/upex-galaxy/               │
│      agentic-qa-boilerplate.git <your-repo-name>           │
│    bun install && bun run pw:install                       │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. RUN DISCOVERY (reverse engineering)                      │
│    Load the /project-discovery skill                        │
│                                                             │
│    This skill:                                              │
│    • Discovers business/architecture/infrastructure context│
│    • Generates .context/ (PRD/, SRS/)                      │
│    • Generates business-data-map / api-architecture /      │
│      master-test-plan                                     │
│    • Regenerates README.md and CLAUDE.md                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. ADAPT KATA FRAMEWORK TO YOUR STACK                       │
│    Run the /adapt-framework command                         │
│                                                             │
│    This command:                                            │
│    • Consumes .context/ from step 2                        │
│    • Plan phase (no writes) -> user approval               │
│    • Implement phase writes config/, api/schemas/,         │
│      tests/components/** wired to your auth + stack        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. VERIFY SETUP                                             │
│    bun run type-check                                       │
│    bun run lint                                             │
│    bun run test --grep @smoke                               │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. START QA WORKFLOW                                        │
│    Load the /sprint-testing skill for in-sprint QA         │
│    Load the /test-automation skill to write tests          │
└─────────────────────────────────────────────────────────────┘
```

### Skills (Workflow Entry Points)

```
.claude/skills/
├── agentic-qa-core/        # Foundation: passive reference host (briefing template, dispatch patterns, orchestration doctrine)
├── project-discovery/     # Onboarding and context generation (reverse engineering)
├── sprint-testing/        # In-sprint QA: plan + execute + report (per ticket)
├── test-documentation/    # TMS documentation and test prioritization
├── test-automation/       # KATA planning + coding + review pipeline
├── regression-testing/    # Regression execution + GO/NO-GO decisions
├── xray-cli/              # Xray TMS helper (tests, executions, imports, ...)
├── acli/                  # Atlassian CLI for Jira Cloud ([ISSUE_TRACKER_TOOL])
├── git-flow-master/       # End-to-end Git operator (auto-detects branching strategy)
├── framework-development/ # Gateway for SDD-* chains evolving the boilerplate itself
└── agentic-qa-onboard/    # First-time orientation tour
```

### Skills at a Glance

| Skill | Trigger | Purpose |
|-------|---------|---------|
| **agentic-qa-core** | (auto, cited by other skills) | Foundation: passive reference host for shared doctrine (briefing template, dispatch patterns, orchestration, skill-composition strategy). Loaded on demand by workflow skills — not invoked directly. |
| **project-discovery** | `/project-discovery` | Onboard a project to this boilerplate. 4-phase discovery (Constitution -> Architecture -> Infrastructure -> Specification) producing PRD, SRS, domain glossary; orchestrates the `/business-*-map` and `/master-test-plan` commands. Reverse-engineering only. |
| **sprint-testing** | `/sprint-testing` | Orchestrate in-sprint manual QA per ticket across **Stages 1-3** (Planning, Execution, Reporting). |
| **test-documentation** | `/test-documentation` | **Stage 4**. Analyze, prioritize (ROI) and document test cases in the TMS. Produces Candidate / Manual / Deferred verdicts. |
| **test-automation** | `/test-automation` | **Stage 5**. Plan -> Code -> Review automated tests on KATA + Playwright + TypeScript. |
| **regression-testing** | `/regression-testing` | **Stage 6**. Execute regression / smoke / sanity suites via CI/CD, classify failures, emit GO / CAUTION / NO-GO. |
| **playwright-cli** | `/playwright-cli` | Browser automation CLI: screenshots, tracing, video recording, session management, request mocking. *(community skill — installed at PROJECT level by `bun run install`; not committed in repo.)* |
| **playwright-best-practices** | `/playwright-best-practices` | Playwright + TypeScript reference: flaky-test fixes, POM vs fixtures, axe-core, auth/OAuth, perf budgets, i18n, component testing. Auto-loads in the Code phase of `/test-automation`. *(community skill by currents.dev — installed at PROJECT level by `bun run install`; not committed in repo.)* |
| **xray-cli** | `/xray-cli` | Xray Cloud test management CLI: tests, executions, plans, JUnit/Cucumber/Xray JSON imports, project backup/restore. |
| **acli** | `/acli` | Atlassian CLI for Jira Cloud — resolves `[ISSUE_TRACKER_TOOL]` and (in Modality B) `[TMS_TOOL]`. |
| **framework-development** | `/framework-development` | Gateway for chaining SDD-* skills. Use for evolving the boilerplate itself (KATA bases, fixtures, cli/, scripts/, api/schemas/ pipeline). NOT for per-ticket QA. |

### How to Use Each Skill

Each skill auto-activates when your prompt matches its description triggers. You can also invoke a skill explicitly in Claude Code by typing its slash trigger (e.g. `/sprint-testing`). The sample prompts below are plain user utterances -- type them into the agent terminal as-is.

#### 1. Onboarding a new project

- **Situation**: You just cloned the boilerplate against a new target app and need `.context/` + CLAUDE.md generated, then the KATA framework adapted to the real stack.
- **Skill**: `/project-discovery` (discovery) -> **Command**: `/adapt-framework` (KATA adaptation)
- **Sample prompts**:
  - "Onboard this boilerplate to the app in `../my-frontend`."
  - "Generate the `.context/` files for this project."
  - After discovery completes: "Adapt the KATA framework to this project."
- **What happens next**: `/project-discovery` discovers business/architecture/infrastructure context, generates `.context/` (`PRD/`, `SRS/`, `business/business-data-map.md`, `business/business-feature-map.md`, `business/business-api-map.md`, `master-test-plan.md`), and refreshes CLAUDE.md. After discovery outputs exist, `/adapt-framework` wires `config/`, `api/schemas/`, and `tests/components/**` to your stack through a Plan -> Approval -> Implement flow.

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
- **What happens next**: The skill creates Test / ATP / ATR entities in the TMS following the project's naming conventions and prioritizes candidates using an ROI rubric. Two modalities are supported: Xray on Jira (Modality A) and Jira-native without Xray (Modality B). See `CLAUDE.md` §Tool Resolution for how `[TMS_TOOL]` resolves per modality.

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

#### 8. Atlassian CLI operations (`/acli`)

- **Situation**: You need to talk to Jira Cloud directly (create issues, transition tickets, comment on a story, list project boards, bulk-edit work items). This skill resolves the `[ISSUE_TRACKER_TOOL]` pseudocode tag used by every workflow skill, and in Modality B (Jira-native, no Xray) it also resolves `[TMS_TOOL]`.
- **Skill**: `/acli`
- **Sample prompts**:
  - "Create a bug in Jira for UPEX-456."
  - "Transition UPEX-200 to Done."
  - "List all open issues assigned to me."
- **What happens next**: The skill drives the official `acli` binary (Atlassian CLI, GA 2025) with the right authentication, project key, and field-mapping conventions for the active workspace.

### How Skills Activate

- **Description-matching**: Skills auto-activate when your prompt matches the triggers declared in each skill's `description` frontmatter. You normally do not need to name the skill.
- **Explicit slash trigger** (Claude Code only): You can force-load a skill by typing `/skill-name` (e.g. `/sprint-testing`).
- **Other agents** (Codex, Cursor, Copilot, OpenCode): Slash commands are not available, but the same `description` triggers cause the skills to auto-activate from natural prompts. OpenCode reads `.claude/skills/` and `CLAUDE.md` natively when its own paths are absent — no symlinks needed.

### AI Memory (CLAUDE.md)

Memory lives in `CLAUDE.md` — the single canonical file read by both Claude Code and OpenCode (the latter falls back to Claude Code conventions). Use `/sync-ai-memory` to sync all AI-critical documents and the project-specific facts inside them (Project Identity, Environment URLs, Discovery Progress, Access Configuration) across the repo in one pass.

### Multi-Agent Portability

Skills follow the [agentskills.io](https://agentskills.io) spec. The repo ships a single `.claude/skills/` directory and a single `CLAUDE.md` at the root — Claude Code reads them natively, and OpenCode reads them as fallbacks when its own conventions (`AGENTS.md`, `.config/opencode/skills/`) are absent. No symlinks, no duplicated files.

| Resource | Layout |
|----------|--------|
| Skills directory | `.claude/skills/` (single canonical location) |
| Memory file | `CLAUDE.md` (single canonical location) |

**Portability constraints** (features that degrade gracefully outside Claude Code):

- Slash commands (`/skill-name`) are Claude Code specific. In other agents, skills auto-activate from the `description` triggers -- prompt the agent in plain language and the right skill loads.
- Sub-agent dispatch used by the batch modes of `/sprint-testing`, `/test-documentation`, `/test-automation`, and `/regression-testing` falls back to sequential execution in agents that lack a sub-agent primitive; throughput is lower but the flow still completes. See `.claude/skills/agentic-qa-core/references/dispatch-patterns.md` for the full pattern matrix.
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
- `package.json` — name, description, repository
- `CLAUDE.md` (canonical AI memory, read by both Claude Code and OpenCode)
- `.agents/project.yaml` — AI context vars (or run `bun run agents:setup` for an interactive walkthrough)
- `config/variables.ts` — runtime URLs for Playwright (`envDataMap`)

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

Load the `/project-discovery` skill in your AI assistant to generate project-specific context (PRD, SRS, business-data-map, business-feature-map, business-api-map, master-test-plan).

---

## Contributing

1. Load the `/test-automation` skill and read its `references/kata-architecture.md`
2. Follow the automation standards referenced by that skill
3. Use conventional commits
4. Ensure all tests pass before PR

---

## Documentation

- `agentic-qa-core` skill -- Foundation: passive reference host cited by workflow skills
- `/project-discovery` skill -- Onboarding and context generation
- `/sprint-testing` skill -- In-sprint QA (planning, execution, reporting)
- `/test-documentation` skill -- TMS test documentation and prioritization
- `/test-automation` skill -- KATA planning + coding + review (includes KATA guide, automation standards, TypeScript patterns, TMS integration)
- `/regression-testing` skill -- Regression execution and GO/NO-GO decisions
- `/playwright-cli` skill -- Browser automation helper (screenshots, tracing, mocking)
- `/xray-cli` skill -- Xray Cloud test management CLI
- `/acli` skill -- Atlassian CLI for Jira Cloud (`[ISSUE_TRACKER_TOOL]`)
- `/git-flow-master` skill -- End-to-end Git operator (auto-detects branching strategy)
- `/framework-development` skill -- Gateway for SDD-* chains evolving the boilerplate itself (KATA, fixtures, installer)
- `/agentic-qa-onboard` skill -- First-time orientation tour
- `docs/` -- Human-facing docs (methodology, workflows, architectures)


---

## License

MIT License

---

**Made with KATA by [UPEX Galaxy](https://github.com/upex-galaxy)**

---

> **You are here**: QA boilerplate repo overview for visitors. **Read time**: 5 min. **Next**: `bunx create-agentic-qa <your-repo-name>` to scaffold a new project, `bun run onboarding` for visual orientation, or [`INSTALLER.md`](INSTALLER.md) for installer details.
