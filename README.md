<div align="center">

<pre>
                  ░█████  ░██████ ░███████░███   ░██░████████░██ ░██████                         
                 ░██  ░██░██      ░██     ░████  ░██   ░██   ░██░██                              
                 ░███████░██  ░███░█████  ░██░██ ░██   ░██   ░██░██                              
  ██████████     ░██  ░██░██   ░██░██     ░██ ░██░██   ░██   ░██░██                              
  ██▀▀▀▀▀▀██     ░██  ░██ ░██████ ░███████░██  ░████   ░██   ░██ ░██████                         
  ██ ◉  ◉ ██     ░░   ░░  ░░░░░░  ░░░░░░░ ░░   ░░░░    ░░    ░░  ░░░░░░                          
  ██   3  ██                                                                                     
  ██████████     ░███████░███   ░██ ░██████ ░██░███   ░██░███████░███████░██████                 
   ██    ██      ░██     ░████  ░██░██      ░██░████  ░██░██     ░██     ░██  ░██                
                 ░█████  ░██░██ ░██░██  ░███░██░██░██ ░██░█████  ░█████  ░██████                 
                 ░██     ░██ ░██░██░██   ░██░██░██ ░██░██░██     ░██     ░██  ░██                
                 ░███████░██  ░████ ░██████ ░██░██  ░████░███████░███████░██  ░██                
                 ░░░░░░░ ░░   ░░░░  ░░░░░░  ░░ ░░   ░░░░ ░░░░░░░ ░░░░░░░ ░░   ░░                 
                               Quality Assurance Engineer                                        
</pre>

<h3>The QA workflow, but AI runs it.</h3>

<p><i>From test plan to regression suite to release sign-off. Built for real QA teams shipping real test cases — every phase has a skill. You decide what to verify.</i></p>

<br />

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-000000?style=for-the-badge&logo=bun&logoColor=white)](https://bun.sh/)
[![License: MIT](https://img.shields.io/badge/License-MIT-EAB308?style=for-the-badge)](https://opensource.org/licenses/MIT)

</div>

<br />
<br />

<div align="center">

### Get started in one command

</div>

```bash
bunx create-agentic-qa@latest <your-repo-name>
```

<div align="center">

<sub><b>One command.</b> Downloads · scrubs git history · renames the project · runs <code>bun install</code> · launches the interactive installer.</sub>

</div>

<br />
<br />

## Prerequisites

Before running `bunx create-agentic-qa@latest` or `bun install && bun run setup`, install the **hard blockers**. The installer detects everything else and prints exact install URLs when something is missing — but front-loading these saves a fail-and-retry loop.

### Hard blockers (installer exits 1 if missing)

| Tool                                                                                                                   | Min version | Why                                                                                                         | Install                                                                                |
| ---------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Bun**                                                                                                                | `>= 1.0.0`  | Runtime for every script (`bun install`, `bun run setup`, `bun run test`, `bun xray`, `bun cli/doctor.ts`)  | macOS/Linux/WSL: `curl -fsSL https://bun.sh/install \| bash` · Windows: `powershell -c "irm bun.sh/install.ps1 \| iex"` · [docs](https://bun.sh/docs/installation) |
| **An agent** — [Claude Code](https://docs.claude.com/en/docs/claude-code), [OpenCode](https://opencode.ai/docs) **or** [Codex](https://developers.openai.com/codex/) | latest      | `bun run setup` Step 4 detects all three (`~/.claude/` or `claude` on PATH · `~/.config/opencode/` or `opencode` on PATH · `codex` on PATH or `.codex/config.toml` in the repo) and lets you pick which to configure; exits 1 only if none is found | See each project's official docs                           |
| `git`                                                                                                                  | any         | Scaffolder runs `git init`; pre-commit hooks (Husky) require git                                            | [git-scm.com/downloads](https://git-scm.com/downloads)                                 |
| `tar`                                                                                                                  | any         | Scaffolder extracts the template tarball. Either flavour works — GNU tar (Linux, WSL, Git Bash) or bsdtar   | Ships with macOS, Linux, and Windows 10 1803+ / Windows 11 (`C:\Windows\System32\tar.exe`) |

> **Windows**: PowerShell and cmd are supported — no WSL or Git Bash required. Install Bun with the PowerShell one-liner above rather than `npm i -g bun`, which writes only a `bun.cmd` shim.

### Quasi-required (installer warns + offers install)

| Tool          | Min version | Why                                                                                                                                                                                                       | Install                                                                                                                                                                            |
| ------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **gentle-ai** | `>= 1.26.5` | Installs the Engram persistent memory component via `--preset minimal`. Framework still runs without it, but cross-session memory is off. SDD-\* skills are NOT installed by default — all shipped workflow skills (`/framework-development`, `/sprint-testing`, `/test-automation`, etc.) run self-contained without them. | macOS: `brew install gentle-ai` · Linux: `go install github.com/Gentleman-Programming/gentle-ai/cmd/gentle-ai@latest` · [repo](https://github.com/Gentleman-Programming/gentle-ai) |

### Per-skill CLIs (lazy-required — needed when the skill runs, not at setup)

These are **not optional** for the workflow — each one is required by a specific skill. They are non-blocking at setup time because the installer cannot guess which skills you will actually use. Install them up front if you plan to use the whole stack, or lazily when the skill that uses them surfaces a missing-binary error.

| Tool             | Required by                                                                         | Install                                                                           |
| ---------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `gh`             | `/git-flow-master`, `/regression-testing` (PRs, Actions, releases)                  | [cli.github.com](https://cli.github.com/)                                         |
| `acli`           | `/acli`, `/shift-left-testing`, `/sprint-testing`, `/test-documentation` (Jira / Confluence from terminal) | [Atlassian docs](https://developer.atlassian.com/cloud/acli/guides/install-acli/) |
| `playwright-cli` | `/playwright-cli` skill (agent-driven browser automation)                           | `bun add -g @playwright/cli@latest`                                               |
| `resend`         | `/resend-cli` (email testing flows)                                                 | [resend.com/docs/cli](https://resend.com/docs/cli)                                |
| `jq`             | `acli` JSON pipelines (`acli ... --json \| jq ...`)                                 | [jqlang.github.io/jq/download](https://jqlang.github.io/jq/download)              |
| `rg`             | Repo search used by every agent. **Claude Code bundles it; OpenCode and Codex use the system binary** | `brew install ripgrep` · `apt install ripgrep` · `winget install BurntSushi.ripgrep.MSVC` |

### Convenience opt-ins (pure UX, never required)

| Tool     | What it buys you                                                                                                                                                                                                                                                                          | Install                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `direnv` | Loads `.env` automatically when you `cd` into the repo, so the bare `claude` / `opencode` / `codex` binaries see MCP credentials. Without it the project ships `bun run claude` / `bun run opencode` / `bun run codex` wrappers (via `dotenv-cli`) that do the same thing — direnv just removes the `bun run` prefix. | macOS/Linux: `brew install direnv` / `apt install direnv` · [direnv.net](https://direnv.net/) |

> **Windows users**: skip direnv. The `bun run claude` / `bun run opencode` / `bun run codex` wrappers already load `.env` cross-platform with zero setup. direnv on PowerShell needs version 2.37+ and is officially experimental; Git Bash works but at that point the wrapper is simpler. The installer will offer the direnv hook; just decline it.

### MCP credentials (`.env` keys)

Each harness has its own MCP config — `.mcp.json` (Claude Code), `opencode.jsonc` (OpenCode), `.codex/config.toml` (Codex) — and all three ship with credential placeholders that read from `.env`. Seven keys are required for the 6 canonical MCPs:

```
TAVILY_API_KEY
ATLASSIAN_EMAIL · ATLASSIAN_API_TOKEN
API_BASE_URL · OPENAPI_SPEC_PATH · API_TOKEN
POSTMAN_API_KEY
```

**The Atlassian site host is not one of them.** It lives in `.agents/project.yaml` -> `issue_tracker.atlassian_url` and is read with `bun run --silent jira:url` (`--slug` for the bare host `acli --site` wants). It was pulled out of `.env` because a stale copy inherited from the parent shell silently shadowed the file — `jira:sync-issues` rebuilt the local PBI cache from a dead Jira site and exited 0, and the Jira-Direct TMS provider would have written results there. A hostname is not a secret, and it is project identity, so it belongs in a versioned file that shows up in a diff.

`.env.example` has the full template with per-var comments. Run `bun run setup:doctor` at any time to see which are still missing — it prints `pending_actions[].where` URLs for every credential.

### When the installer tells you something is wrong

| Stage                    | Check depth                                                                                                                     | Behavior                                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preflight (Step 0)       | Version compare — reads `Bun.version`, parses semver, requires `>= 1.0.0`. Also checks `node_modules/@inquirer/prompts` exists. | Hard exit 1 with explicit `Fix:` command before any other step.                                                                                                                                           |
| Step 2 — gentle-ai       | Version compare — runs `gentle-ai version`, parses semver, requires `>= 1.26.5`.                                                | Missing: prints brew + go install commands + docs URL, asks exit-or-continue. Too old: warns and continues with `gentle-ai update` hint.                                                                  |
| Step 4 — agents          | Detects Claude Code, OpenCode and Codex (config directory, binary on PATH, or `.codex/config.toml`), then prompts which to configure. | None of the three found: prints all three docs URLs, hard exit 1.                                                                                                                                     |
| Step 10 — per-skill CLIs | PATH probe — runs `which <name>` (POSIX) or `where <name>` (Windows). Presence only, no version check.                          | Prints `found`/`missing` table; for missing entries adds `quick:` install command (when cross-platform) + `docs:` URL. Non-blocking.                                                                      |
| direnv (optional)        | Presence + `.envrc` allow status + shell-rc hook line.                                                                          | Pure convenience nudge — the `bun run claude` / `bun run opencode` / `bun run codex` wrappers already work without it. If absent, lists `system_install` action with install command; safe to decline (recommended on Windows). |
| `bun run setup:doctor`   | Re-runs everything above + 7 MCP `.env` vars + Playwright browser cache.                                                        | Human-readable or `--json` report. Every `pending_action` carries a `where` hint or URL — re-run any time after partial setup.                                                                            |

> **TL;DR**: install **Bun** plus at least one of **Claude Code, OpenCode, or Codex** before you run setup. Everything else, the installer points you at when you hit it.

<br />
<br />

## Start here — pick your path

| Goal                                                  | What to read / run                                                                                                                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Start a new project — magic command (recommended)** | `bunx create-agentic-qa@latest <your-repo-name>` — official scaffolder ([npm](https://www.npmjs.com/package/create-agentic-qa))                                                                               |
| **Start a new project — GitHub "Use this template"**  | Click [**Use this template**](https://github.com/upex-galaxy/agentic-qa-boilerplate/generate) → clone your new repo → `bun install && bun run setup` (see [Other ways to start](#other-ways-to-start)) |
| **Contribute to the boilerplate itself**              | `git clone …` then `bun install && bun run setup` (see [Other ways to start](#other-ways-to-start))                                                                                                    |
| **Get oriented before installing**                    | `bun run onboarding` — opens `docs/onboarding.html` with sidebar nav                                                                                                                                   |
| **Understand the methodology**                        | [`docs/agentic-quality-engineering.md`](docs/agentic-quality-engineering.md)                                                                                                                           |
| **See what `bun run setup` configures**               | [`INSTALLER.md`](INSTALLER.md) — run `bun cli/doctor.ts` after setup                                                                                                                                   |
| **You're an AI agent**                                | [`AGENTS.md`](AGENTS.md) (auto-loaded each session on every supported harness)                                                                                                                         |

> First-timers, use the scaffolder. It handles tarball download, git scrub, rename, `bun install`, and the interactive installer in one shot. The manual clone is for people hacking on the boilerplate itself.

<br />

## What this is

A starter for QA teams that want AI agents driving the testing workflow — not isolated test snippets, but the whole loop. Plan a sprint, document test cases in Jira/Xray, write KATA-compliant Playwright tests, run regression, sign off the release. Eight workflow skills cover the phases. A handful of slash commands handle the chores around them. The development half (project foundation, sprint dev, deploys) lives in [agentic-dev-boilerplate](https://github.com/upex-galaxy/agentic-dev-boilerplate) — pair them or use one.

<br />

## Scaffold a new project

`create-agentic-qa` is the official scaffolder ([npm](https://www.npmjs.com/package/create-agentic-qa), source in [`packages/create-agentic-qa/`](packages/create-agentic-qa/)). One command, full setup:

```bash
bunx create-agentic-qa@latest <your-repo-name>
cd <your-repo-name>
```

What it does:

1. Downloads `upex-galaxy/agentic-qa-boilerplate` (latest `main`) as a tarball — no git history.
2. Rewrites `package.json` name + `.agents/project.yaml` `project.name`.
3. Initializes a fresh `git init -b main` with an initial commit.
4. Runs `bun install`.
5. Hands off to `bun run setup` — gentle-ai, 19 committed skills, community skills, the MCP servers `.mcp.json` declares, `.env`, direnv autoload, optional `gh repo create`.

Useful flags (full list in [`packages/create-agentic-qa/README.md`](packages/create-agentic-qa/README.md)):

| Flag                           | Effect                                                          |
| ------------------------------ | --------------------------------------------------------------- |
| `--here`                       | Bootstrap into the current directory instead of a new one.      |
| `--template <ref>`             | Pin to a branch / tag / SHA instead of `main`.                  |
| `--template-repo <owner/repo>` | Use a fork instead of `upex-galaxy/agentic-qa-boilerplate`.     |
| `--project-key UPEX`           | Pre-fill the Jira project key (otherwise prompted).             |
| `--no-install` / `--no-setup`  | Skip `bun install` or the interactive installer.                |
| `--non-interactive`            | Auto-pick defaults (also auto-detected when no TTY is present). |

Then continue with the per-project workflow:

```bash
# Optional: open the orientation HTML (single-file tour, sidebar nav)
bun run onboarding

# Optional, Claude Code only: configure the statusline in a SEPARATE terminal
bunx -y ccstatusline@latest

# Drive the QA lifecycle inside the agent:
/agentic-qa-onboard     # first-time orientation tour
/project-discovery      # reverse-engineer the target app into .context/
/adapt-framework        # wire KATA to the target stack (auth, vars, CI, MCP) — run once after discovery
/shift-left-testing     # Stage 0: pre-sprint AC refinement on backlog batch
/sprint-testing         # in-sprint manual QA per ticket (plan + execute + report)
/test-documentation     # TMS docs + ROI scoring (Candidate / Manual / Deferred)
/test-automation        # KATA Plan -> Code -> Review
/regression-testing     # CI execution + GO / CAUTION / NO-GO
```

> Don't chain `bun run onboarding && bun run setup` — the onboarding server is blocking and the chain deadlocks. Run them as separate steps.

> `bunx -y ccstatusline@latest` is Claude Code-only and optional. Run it from a plain terminal with NO agent running — concurrent TUIs fight over stdin and the configurator silently breaks. OpenCode users skip this: the `opencode-subagent-statusline` plugin is already wired into `opencode.jsonc`.

<br />

## Launching the agent

Every MCP config ships with credential placeholders — real values live in `.env`. Launch the agent via one of these so env vars actually load:

```bash
# Cross-platform default (uses dotenv-cli, no extra tooling required):
bun run claude        # Claude Code
bun run opencode      # OpenCode
bun run codex         # Codex CLI

# Optional: direnv autoload (any OS with direnv installed)
direnv allow          # one-time per repo (the installer offers to run this)
claude                # direct binary picks up .env from your shell

# Or load .env into your CURRENT shell once, then run any binary directly:
set -a; source .env; set +a   # bash/zsh only — exports every .env key into this session
claude                        # now claude / opencode / codex / acli / bun xray all see the vars
```

Each wrapper is `dotenv -o -e .env -- <binary>`. The `-o` forces `.env` to win over an inherited process variable; launching the bare executable skips that, so a stale value from the parent shell can silently shadow the file.

**Codex Desktop** consumes the same repository configuration as the CLI — no second convention, no extra directory. One caveat applies to both: Codex loads the project's `.codex/` config and hooks **only in a repository you have marked trusted**. `bun run setup:doctor` reports that trust on its own line, because it is runtime state no file check can verify.

PowerShell equivalent of that last block:

```powershell
Get-Content .env | Where-Object { $_ -match '^\s*[^#].*=' } | ForEach-Object {
  $k, $v = $_ -split '=', 2
  Set-Item -Path "Env:$($k.Trim())" -Value $v.Trim()
}
claude
```

> Run the snippet **inline** in the shell you are already in. Wrapping it in a script would export into a child process that exits immediately, leaving your terminal untouched — which is why there is no `bun run env` script.

direnv works on macOS / Linux / Windows. On Windows install via `winget install direnv` — Git Bash is recommended; PowerShell support is experimental and requires direnv 2.37+. See [INSTALLER.md § Launching the agent](./INSTALLER.md#launching-the-agent-after-setup) for the per-shell hook lines.

<br />

<details>
<summary><b>Other ways to start</b> — GitHub template flow + manual clone for contributors</summary>

<br />

### Use this template (GitHub)

Prefer to start your project **on GitHub from day one** (your own repo, your own remote, full history under your account)? Use GitHub's native template flow:

1. Click [**Use this template → Create a new repository**](https://github.com/upex-galaxy/agentic-qa-boilerplate/generate) on the boilerplate's GitHub page.
2. Pick owner + name for your new repo, choose visibility, create.
3. Clone YOUR new repo locally:

   ```bash
   git clone https://github.com/<your-org>/<your-repo>.git
   cd <your-repo>
   ```

4. Install + configure:

   ```bash
   bun install
   bun run setup        # gentle-ai, skills, community skills, .env wiring, MCPs
   ```

5. (Optional) Rename the project inside the codebase: edit `package.json` → `name`, and `.agents/project.yaml` → `project.name`.

> **The magic command does this better.** `bunx create-agentic-qa@latest <your-repo-name>` does everything the template flow does **plus**: scrubs the upstream git history (so your repo doesn't carry boilerplate commits), auto-rewrites `package.json` name and `.agents/project.yaml` `project.name`, runs `bun install`, runs the interactive installer, and optionally creates the GitHub repo for you via `gh` — all in one command. The template route is a good fit only if you want the GitHub repo created via the web UI before any local work.

### Manual clone (contributors)

Hacking on the boilerplate **itself** (skills, installer, scripts, docs)? Clone the repo directly:

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

> End-users building a new project should NOT clone manually — use `bunx create-agentic-qa@latest` so git history is scrubbed and the project is renamed automatically.

</details>

<br />

## How it works

Skills auto-trigger when your prompt matches their `description` frontmatter — or you force-load with a slash command (`/sprint-testing`). Each skill is a `SKILL.md` plus a `references/` folder. The agent only reads what the current step needs, so context stays lean.

Project values (URLs, project key, Jira fields) live in `.agents/project.yaml` and get injected into prompts via a 4-syntax variable system. Skills are grouped by phase: onboarding (one-time discovery), in-sprint QA (continuous), automation (per story), regression (per release). The dev companion repo follows the same pattern.

<br />

## Features

| Feature                    | Description                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------- |
| **KATA Architecture**      | Komponent Action Test Architecture for clean test organization                     |
| **Playwright**             | Modern browser automation with auto-waiting and tracing                            |
| **Allure Reports**         | Rich test reports with history and trends                                          |
| **TMS Sync**               | Automatic sync of test results to Jira/Xray                                        |
| **Context Engineering**    | `.context/` directory with AI-friendly documentation                               |
| **Skills-based Workflows** | Agent skills under `.agents/skills/` drive the AI-assisted QA and automation flows |
| **Multi-harness**          | One instruction body and one skill store, consumed by Claude Code, OpenCode and Codex |
| **MCP Integration**        | Ready for Playwright, Database, and API MCPs                                       |

<br />

## Configuration

This boilerplate has **two configuration systems** that serve different consumers and must not be conflated:

| System                     | File                           | Consumer                                                                                                                | Loaded at            |
| -------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **Runtime test config**    | `.env` + `config/variables.ts` | Playwright runner, KATA components, `bun run *` scripts (jiraSync, env validate, etc.)                                  | Test execution time  |
| **AI context engineering** | `.agents/project.yaml`         | Every supported harness (Claude Code, OpenCode, Codex) — used to resolve `{{VAR}}` references in skills, commands, and templates | AI session bootstrap |

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
STP_EXECUTION_KEY=          # key of the STR (not the STP) that results are imported onto
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

Every supported harness (Claude Code, OpenCode, Codex) resolves `{{VAR}}` references in skills, templates, and commands against `.agents/project.yaml`. Edit it manually, or run the interactive walkthrough:

```bash
bun run agents:setup
```

This populates `project.project_name`, `project.project_key`, `issue_tracker.atlassian_url`, `environments.<env>.web_url`, `environments.<env>.api_url`, `environments.<env>.db_mcp`, `environments.<env>.api_mcp`, and the rest. See `.agents/README.md` for the full convention.

<br />

## Run Tests

```bash
# Run all tests
bun run test

# Run with UI mode (recommended for development)
bun run test:ui

# Run specific test types
bun run test:e2e           # E2E tests only
bun run test:integration   # API tests only
bun run test:smoke         # smoke / @critical tests
```

<br />

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
│   └── validateTestEnv.ts        # Test environment validation
│
├── .context/                     # AI Context Engineering (generated)
│   ├── business/                  # business-data-map / business-feature-map / business-api-map
│   ├── master-test-plan.md       # What to test and why
│   ├── PRD/                      # Product requirements
│   ├── SRS/                      # Technical specs
│   ├── reports/                  # Generated output (GITIGNORED except its README): test map, regression reports
│   └── PBI/                      # Per-ticket backlog items (GITIGNORED Jira cache; `bun run context:hydrate`)
│
├── .agents/                      # Agentskills.io spec layout — the shared, harness-agnostic substrate
│   ├── project.yaml              # AI context vars (resolved as {{VAR}} by skills)
│   ├── jira-fields.json          # Jira custom-field catalog (synced by `bun run jira:sync-fields`)
│   ├── jira-required.yaml        # Required Jira custom-field manifest
│   ├── README.md                 # Variable conventions reference
│   ├── compatibility/            # command-aliases.json — source for every generated slash-command wrapper
│   ├── hooks/                    # personality-reinject.mjs — one emitter, three harness adapters
│   └── skills/                   # THE skill store (19 committed) — read by all three harnesses
│       ├── agentic-qa-core/      # Foundation: passive reference host (briefing template, dispatch patterns, orchestration doctrine)
│       ├── project-discovery/    # Onboarding + context generation
│       ├── sprint-testing/       # Planning + execution + reporting
│       ├── test-documentation/   # TMS documentation + prioritization
│       ├── test-automation/      # KATA planning + coding + review
│       ├── regression-testing/   # Regression execution + GO/NO-GO
│       ├── xray-cli/             # Xray TMS helper
│       └── acli/                 # Atlassian CLI helper ([ISSUE_TRACKER_TOOL])
│
├── .claude/                      # Claude Code adapter — settings.json (hook) + generated commands/ and skills alias
├── .opencode/                    # OpenCode adapter — plugins/personality-reinject.js + generated commands/
├── .codex/                       # Codex adapter — config.toml (MCP) + hooks.json. Shared by CLI and Desktop
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
│   └── create-agentic-qa/        # Official npm scaffolder (bunx create-agentic-qa@latest <your-repo-name>) — own README + tests
│
├── cli/                          # install.ts, doctor.ts, update-boilerplate.ts consumed by bun scripts
│
├── playwright.config.ts          # Playwright configuration
├── INSTALLER.md                  # Contract for bun run setup — what each installer layer does
├── AGENTS.md                     # AI memory — the ONLY instruction body, loaded by all three harnesses
├── CLAUDE.md                     # One-line shim (`@AGENTS.md`) so Claude Code reaches it. Never holds prose
├── .mcp.json                     # MCP config — Claude Code
├── opencode.jsonc                # MCP config — OpenCode
└── package.json                  # Scripts and dependencies
```

<br />

## KATA Architecture

This boilerplate implements **KATA** (Komponent Action Test Architecture).

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

| Component | Purpose             | Location                  |
| --------- | ------------------- | ------------------------- |
| **Api**   | HTTP interactions   | `tests/components/api/`   |
| **Page**  | UI interactions     | `tests/components/ui/`    |
| **Step**  | Reusable ATC chains | `tests/components/steps/` |

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

<br />

## Available Scripts

### Test Execution

| Script                      | Description              |
| --------------------------- | ------------------------ |
| `bun run test`              | Run all tests            |
| `bun run test:ui`           | Open Playwright UI mode  |
| `bun run test:debug`        | Run with debugger        |
| `bun run test:headed`       | Run with browser visible |
| `bun run test:e2e`          | Run E2E tests only       |
| `bun run test:integration`  | Run API tests only       |
| `bun run test:smoke`        | Run smoke / @critical tests |
| `bun run test:retries`      | Run with 2 retries       |
| `bun run test:last-failed`  | Re-run failed tests      |

### Reports

| Script                         | Description              |
| ------------------------------ | ------------------------ |
| `bun run test:report`          | Open Playwright report   |
| `bun run allure:run`           | Generate and open Allure |
| `bun run allure:generate`      | Generate Allure only     |
| `bun run allure:open`          | Open existing Allure     |
| `bun run allure:agent`         | Run tests through the Allure agent |
| `bun run allure:watch`         | Live-watch `allure-results`        |
| `bun run test:sync`            | Sync results to TMS      |

### Code Quality

| Script                  | Description          |
| ----------------------- | -------------------- |
| `bun run lint:check`    | Run ESLint           |
| `bun run lint:fix`      | Fix linting issues   |
| `bun run format:check`  | Prettier check only  |
| `bun run format:fix`    | Format with Prettier |
| `bun run types:check`   | TypeScript check     |
| `bun run repo:check`    | Full quality suite (format + lint + types + vars + skills + registry + env + git-policy parity) — the checks the pre-push hook approximates |
| `bun run repo:fix`      | Same suite, auto-fixing format + lint first |

### Utilities

| Script                   | Description                |
| ------------------------ | -------------------------- |
| `bun run pw:install`     | Install browsers           |
| `bun run test:env:check` | Validate test environment  |
| `bun run test:clean`     | Remove test artifacts      |

### CLI Tools

| Script                        | Description                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `bun run up`              | Sync project with template (skills, docs)                                    |
| `bun run xray`                | Xray CLI for test management                                                 |
| `bun run api:sync`            | Sync OpenAPI spec and generate types                                         |
| `bun run kata:manifest`       | Extract ATCs from codebase into a manifest (`--watch` flag available)        |
| `bun run agents:setup`        | Interactive walkthrough to populate `.agents/project.yaml`                   |
| `bun run git:policy`          | Parity between the declared `git_strategy:` (`.agents/project.yaml`) and GitHub's enforced ruleset: `verify` (read-only, runs on every push via pre-push; accepted divergences pass), `apply` (writes the ruleset, dry-run unless `--yes`), `plan`. Strategy itself is chosen via git-flow-master's "set up our git strategy" questionnaire. |
| `bun run vars:check`          | Lint `.agents/` files for missing required values                            |
| `bun run skills:check`        | Validate T1-T4 skill tier coherence (frontmatter, categories, anti-leak)     |
| `bun run jira:sync-fields`    | Sync Jira custom-field catalog into `.agents/jira-fields.json`. **Requires Jira `Administer` permission** — non-admin users get a friendly skip + the UPEX-standard fallback below. |
| `bun run jira:sync-workflows` | Sync Jira workflow statuses + transitions into `.agents/jira-workflows.json`. Same admin requirement as `jira:sync-fields`. |
| `bun run jira:sync-link-types`| Sync workspace issue-link types into `.agents/jira-link-types.json`. USER-OK (no admin needed). Manual-only — not auto-invoked by setup. |
| `bun run jira:sync-issues`    | Pull Jira Epics/Stories/Bugs into `.context/PBI/` markdown files             |
| `bun run context:hydrate`     | Rebuild the whole gitignored `.context/PBI/` cache from Jira                 |
| `bun run tests:map`           | Render the synced `.context/PBI/` cache as a self-contained HTML coverage map (`.context/reports/test-map.html`), gaps first — epics/stories without tests, orphan Tests, Tests without a component. Disk-only, no Jira calls; `--out <path>`, `--json` |
| `bun run jira:check`          | Verify Jira workspace has required custom fields configured                  |
| `bun run jira:components`     | Reconcile the Jira project's Components against an approved plan file (dry run by default; `--apply` writes, `--list --project <KEY>` inspects). Renames preserve issue assignments; creates are additive. Driven by `/jira-components`. |

> **`--upex` flag** — the catalog sync scripts (`jira:sync-fields`, `jira:sync-workflows`, `jira:sync-link-types`) accept `--upex` to download the UPEX-standard reference JSON from `upex-galaxy/agentic-qa-boilerplate@main` instead of hitting Jira. Use when you don't have admin access, when you want a working catalog without setting up auth, or when you want the canonical UPEX standard as a reference. Examples: `bun run jira:sync-fields --upex`, `bun run jira:sync-workflows --upex`, `bun run jira:sync-link-types --upex`. `jira:sync-issues` does not take the flag — it always pulls from your Jira instance.

<br />

## Keeping your project in sync with the boilerplate

`bun run up` (updater 8.2) keeps your project aligned with the official template by tracking which upstream commit each piece of the framework (`.agents/skills/`, `scripts/`, `cli/`, `.husky/`, ...) was last synced from. Instead of overwriting framework files blindly, it:

1. Reads `.template/boilerplate.lock.json` (committed in your repo) to find the last-synced SHA per component
2. Clones the template lazily (sparse checkout, only the dirs that get synced)
3. Computes the exact list of changed files between your synced SHA and template HEAD
4. Classifies each file: clean fast-forward, locally diverged, new upstream, deleted upstream, binary, or whitespace-only
5. Applies the plan for the mode you chose (see the flags below). Every overwrite is backed up (`.backups/`, restorable with `--rollback`) and the exact diff stays visible in git history
6. Regenerates the derived surfaces from their sources (`bun run agents:compat`, `skills:registry`, `kata:manifest` logic) and runs the project's own gates
7. Closes with one "Estado por superficie" table and ONE parity prompt for your AI (details below)

**Requirements**: git 2.25 or newer (partial clone with `--filter=blob:none`), Bun, GitHub CLI authenticated (or `UPEX_TEMPLATE_REPO` pointing at a local clone).

| Flag | Effect |
| ---- | ------ |
| (none) | Interactive 5-phase flow: pick components, resolve divergences, confirm deletions |
| `--auto` | Non-interactive: copies new files and overwrites divergences with upstream. Never deletes files upstream removed |
| `--force` | Like `--auto`, and also deletes files upstream removed (backup + `--rollback` still apply) |
| `--interactive`, `-i` | Keeps the prompts even when stdin is not a terminal |
| `--dry-run` | Preview without writing. Prints the parity table; the prompt is not saved. With a newer updater upstream, the preview runs the NEW updater from the upstream clone, so it shows what the real run will do |
| `--strict` | Exit 1 when the run ends with a BLOCKING parity finding (compat contract broken: alias, wrappers, hooks, MCP). Default: warn, exit 0. Drift on protected files never blocks |
| `--no-gates` | Skip the post-sync gates (`types:check`, `lint:check`, `kata:manifest:check`) |
| `--rollback` | Restore the most recent backup |
| `--skill a,b` / `--list` | Sync only the named skills / list the skills the template offers |

Without a TTY on stdin and no `--auto` / `--interactive`, the run assumes `--auto` and says so in one line instead of waiting on the phase-3 multi-select. `UPEX_TEMPLATE_REPO` points the updater at a fork (`OWNER/REPO`) or at a local clone (absolute path or `file://`), which is how an unpublished branch is tested against a consumer.

**What a run leaves behind.** Every run ends with a single "Estado por superficie" table (10 rows: Instrucciones y config / Skills / Comandos / Hooks / MCP / Env / Componentes / package.json / Git / Verificación, one ok or warn glyph per row) followed by ONE parity prompt, also saved to `.agents/prompts/parity-plan.md` (gitignored, single-use). The prompt lists every difference between the project and upstream as a numbered row with concrete evidence (headings added or removed in `AGENTS.md`, hunk counts, server ids missing from a host, wrapper files no manifest produced, archived skill collisions) and asks the AI to present the table and WAIT for a per-row decision, `keep project | take upstream | merge`, before editing anything. One row per path: a stray wrapper is a single `add to overlay` row, and a watched file that also fails a compat contract (say `.codex/config.toml` missing a server) is one blocking row carrying both pieces of evidence. `take upstream` is suggested only where the project lacks the content entirely; a row naming project-only servers, keys, headings or edits says `merge`, and every `merge` on a watched file says what to port and what to keep (`port upstream additions only: <keys>; keep project-only: <keys>`). Rows on `package.json` (a key kept at the project's value, both values in the saved file) and on `Verificación` (a gate that failed: exit code, first error lines, which applied files it names) are informational, never blocking.

**Protected files and `updater.protected_paths`.** `AGENTS.md`, `.mcp.json`, `opencode.jsonc`, `.codex/config.toml`, `.claude/settings.json`, `.husky/pre-commit`, `.husky/pre-push`, `allurerc.mjs`, `playwright.config.ts`, the KATA bases under `tests/components/` and the CI workflows are never overwritten (also under `--auto` and `--force`): they only appear in the parity report, one drift row per upstream change. `.claude/settings.json`, `.codex/` and the two husky hooks are delivered once when missing (bootstrap-only). A project protects any other synced file it merged by hand through `updater.protected_paths` in `.agents/project.yaml` (repo-relative file paths, same semantics; a path outside the repo, under `.git`, a directory or a non-string is reported and ignored). The row for an overwritten project edit names its `.backups/` copy and ends with that fix; the saved prompt repeats it as the YAML to paste. `.agents/project.yaml` and `.agents/jira-required.yaml` are compared by structure only: an `informational` row for keys upstream added, no row for value differences (project identity).

**Safe re-runs and aborts.** The sync leaves its files uncommitted on purpose (review the prompt first). The run records what it wrote in `.template/last-apply.json` (gitignored, hashed), and the dirty-tree guard recognises those paths while their hash still matches, so `bun run up` twice in a row without committing is a no-op instead of an abort. A synced path edited by hand since, or an unrelated dirty synced path, still aborts, naming `Commit sugerido` and the prompt path. Uncommitted changes outside the paths the updater writes (your tests, your code, protected files) never block. A run that applies nothing leaves the tree byte-identical (the lock is not rewritten). An aborted run (dirty tree, corrupt lock, failed clone, declined migration or self-update) prints `Abortado.` and exits 1, never a success line.

**Generated surfaces.** `CLAUDE.md` (the `@AGENTS.md` shim), `.claude/skills` (the alias), `.claude/commands/*.md` and `.opencode/commands/*.md` (wrappers), `.agents/skills/REGISTRY.md` and `kata-manifest.json` are rebuilt after every sync and never reported as drift. On the run that migrates a Claude-era project, the `.claude/skills` alias is deliberately NOT created (git cannot rewrite the staged `.claude/skills/*` deletions behind a symlink, so the pre-commit hook would fail): commit the migration, then `bun run agents:compat` creates it; the closing box says so, and any re-run before that commit keeps deferring it.

```bash
bun run up                # interactive
bun run up --auto         # unattended, no deletions
bun run up --dry-run      # preview (parity table included)
bun run up --strict       # CI: exit 1 on a blocking parity finding
bun run up --rollback     # restore the latest backup
```

The `.template/boilerplate.lock.json` file is committable: commit it so your team and CI know exactly which template version each component is on.

<br />

## CI/CD Pipelines

### GitHub Actions Workflows

| Workflow         | Trigger        | Description                 |
| ---------------- | -------------- | --------------------------- |
| `build.yml`      | PR to main     | Validate framework compiles |
| `smoke.yml`      | Daily 2AM UTC  | Run @critical tests         |
| `sanity.yml`     | Manual         | Run tests by grep pattern   |
| `regression.yml` | Daily midnight | Full test suite             |

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
STP_EXECUTION_KEY           # key of the STR (not the STP) that results are imported onto

# Atlassian credentials (required if TMS_PROVIDER=jira AND AUTO_SYNC=true; also
# used by MCP atlassian, acli, xray-cli, and scripts/sync-jira-*.ts).
# The site HOST is NOT here: .agents/project.yaml -> issue_tracker.atlassian_url
# (print it with `bun run --silent jira:url`).
ATLASSIAN_EMAIL
ATLASSIAN_API_TOKEN
JIRA_TEST_STATUS_FIELD      # optional override; resolves from .agents/jira-fields.json -> `test_status`

# Reporting
ALLURE_RESULTS_DIR          # default: ./allure-results
SCREENSHOT_ON_FAILURE       # default: true
VIDEO_ON_FAILURE            # default: true

# CI/CD (set automatically by GitHub Actions)
CI
BUILD_ID
```

`TMS_PROVIDER` is the one entry above that is **not** a secret. `.github/workflows/regression.yml` reads it as `${{ vars.TMS_PROVIDER || 'xray' }}`, so set it as a repository **Variable** (Settings → Secrets and variables → Actions → Variables), not as a secret. A job-level `if:` can read `vars` but never `secrets`, and the Xray import job gates on exactly that expression — stored as a secret it is invisible to the gate and the step stays on the default forever.

<br />

## Skills

### Workflow skills (auto-trigger)

| Skill                        | Trigger                       | Purpose                                                                                                                                                                                                                                                                                              |
| ---------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agentic-qa-core`            | (auto, cited by other skills) | Foundation: passive reference host for shared doctrine (briefing template, dispatch patterns, orchestration, skill-composition strategy). Loaded on demand by workflow skills — not invoked directly.                                                                                                |
| `/project-discovery`         | `/project-discovery`          | Onboard a project to this boilerplate. 4-phase discovery (Constitution → Architecture → Infrastructure → Specification) producing PRD, SRS, domain glossary; orchestrates the `/business-*-map` and `/master-test-plan` commands. Reverse-engineering only.                                          |
| `/shift-left-testing`        | `/shift-left-testing`         | **Stage 0**. Pre-sprint Shift-Left QA on a batch of backlog Stories. Refines ACs, surfaces gaps + ambiguities, authors the Story's ATP early (same field + same Test Plan that `/sprint-testing` later refines — no separate DRAFT artifact), transitions `backlog → shift_left_qa → estimation`. Adds labels `shift-left-reviewed` + `shift-left-{YYYY-MM-DD}` so `/sprint-testing` Stage 1 short-circuits Phases 1-3 later. |
| `/sprint-testing`            | `/sprint-testing`             | Orchestrate in-sprint manual QA per ticket across **Stages 1-3** (Planning, Execution, Reporting).                                                                                                                                                                                                   |
| `/test-documentation`        | `/test-documentation`         | **Stage 4**. Analyze, prioritize (ROI) and document test cases in the TMS. Produces Candidate / Manual / Deferred verdicts.                                                                                                                                                                          |
| `/test-automation`           | `/test-automation`            | **Stage 5**. Plan → Code → Review automated tests on KATA + Playwright + TypeScript.                                                                                                                                                                                                                 |
| `/regression-testing`        | `/regression-testing`         | **Stage 6**. Execute regression / smoke / sanity suites via CI/CD, classify failures, emit GO / CAUTION / NO-GO.                                                                                                                                                                                     |
| `/playwright-cli`            | `/playwright-cli`             | Browser automation CLI: screenshots, tracing, video recording, session management, request mocking. _(community skill — installed at PROJECT level by `bun run setup`; not committed in repo.)_                                                                                                    |
| `/playwright-best-practices` | `/playwright-best-practices`  | Playwright + TypeScript reference: flaky-test fixes, POM vs fixtures, axe-core, auth/OAuth, perf budgets, i18n, component testing. Auto-loads in the Code phase of `/test-automation`. _(community skill by currents.dev — installed at PROJECT level by `bun run setup`; not committed in repo.)_ |
| `/resend-cli`                | `/resend-cli`                 | Resend email testing CLI. Pairs with the `resend` external binary. _(community skill — installed at PROJECT level by `bun run setup`; not committed in repo.)_                                                                                                                                      |
| `bug-screenshot-annotation`  | "annotate bug screenshot", "anota este bug" | Turns a raw bug screenshot into QA-style annotated evidence (circles/arrows/callouts/corner badge/axis ticks) via HTML+CSS overlays rendered 100% locally (loopback HTTP + playwright-cli capture — never an external image service). Loaded inline by `/sprint-testing` Stage 2 for visual/positional bugs.                          |
| `/xray-cli`                  | `/xray-cli`                   | Xray Cloud test management CLI: tests, executions, plans, JUnit/Cucumber/Xray JSON imports, project backup/restore, `test enrich` backfill of the synced Test `.md`s (Preconditions + Test Set membership — Xray-internal, invisible to the Jira REST sync).                                                                                                                                                                                  |
| `/acli`                      | `/acli`                       | Atlassian CLI for Jira Cloud — resolves `[ISSUE_TRACKER_TOOL]` and (in Modality jira-native) `[TMS_TOOL]`.                                                                                                                                                                                                     |
| `/git-flow-master`           | (auto on git/PR intents)      | End-to-end Git operator. Auto-detects branching strategy. Owns branch / commit / push / PR / conflict / chained-PR.                                                                                                                                                                                  |
| `/framework-development`     | `/framework-development`      | Gateway for evolving the boilerplate itself (KATA bases, fixtures, cli/, scripts/, api/schemas/ pipeline). NOT for per-ticket QA. Self-contained Plan → Code → Verify → Archive pipeline; runs under the `gentle-ai install --preset minimal` install. |
| `/judgment-day`              | `/judgment-day`, `juzgar`     | Vendored T2 (gentle-ai, Apache-2.0). Adversarial dual-judge review (2 blind judges in parallel, fix loop, re-judge). Optional gate cited by `/test-automation` Phase 3 + `/git-flow-master` pre-PR. Never auto-invoked.                                                                                |
| `pr-review-lead`             | `pr-review-lead`, "review this PR", "revisa este PR" | QA Lead / QA Architect review of a PR's test-automation work against KATA doctrine (or the target repo's own), grounding every finding in a doctrine citation or code location. Works on this repo or external repos (`owner/repo#PR` via `gh`). Never posts to GitHub without your explicit final OK.        |
| `/agentic-qa-onboard`        | `/agentic-qa-onboard`         | Walks new users through the repo's QA flow, MCPs, env vars, workflow skills.                                                                                                                                                                                                                         |

### Reusable community skills (installed by `bun run setup`)

These aren't committed in this repo. The installer fetches them via `bunx skills add` from upstream community repositories. The exact list lives in `cli/install.ts` — source of truth, changes faster than this README, consult the file directly.

### Skill tiers (T1–T4)

Every skill belongs to one of four tiers. Each tier has different discovery and load rules. Full contract: [`.agents/skills/agentic-qa-core/references/skill-composition-strategy.md`](.agents/skills/agentic-qa-core/references/skill-composition-strategy.md).

| Tier   | What                                   | Location                                              | Load behavior                                               |
| ------ | -------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| T1     | Project-owned (this repo)              | `.agents/skills/`                                     | Silent — load on trigger                                    |
| T2     | Vendored (upstream, attribution kept)  | `.agents/skills/judgment-day/`                        | Silent on explicit trigger or host orchestrator citation    |
| T2-opt | Optional gentle-ai SDD (user-installed)| `~/.claude/skills/sdd-*` only if manually installed   | Silent inside `/framework-development` only — see anti-leak |
| T3     | Community project-level                | Installed by `install.ts` `PROJECT_LEVEL_SKILLS`      | Silent if matched by category                               |
| T4     | Community user-level (global)          | Installed by `install.ts` `USER_LEVEL_SKILLS`         | **ASK** user before load (cross-project, not always wanted) |

T3 project-level community skills install into the same `.agents/skills/` store, so there is never a second copy per harness. T4 user-level skills stay harness-specific (`~/.claude/skills/`, and the equivalent for each host).

Validation: `bun run skills:check` checks tier coherence (orphan categories, tier mismatches, missing sections, stale doc paths).

### Slash commands (transport aliases, not workflows)

These ten commands carry **no workflow body**. Each is a thin alias declared in `.agents/compatibility/command-aliases.json` that names a target skill plus a mode and forwards `$ARGUMENTS`; the wrappers under `.claude/commands/` and `.opencode/commands/` are generated from that manifest by `bun run agents:compat`. Codex has no wrapper layer — invoke the target skill and mode directly.

| Command | Target skill | Mode |
| ------- | ------------ | ---- |
| `/adapt-framework` | `adapt-framework` | `adapt` |
| `/break-down-tests` | `test-automation` | `explain` |
| `/business-data-map` | `project-context` | `data` |
| `/business-feature-map` | `project-context` | `features` |
| `/business-api-map` | `project-context` | `api` |
| `/master-test-plan` | `project-context` | `test-plan` |
| `/fix-traceability` | `test-documentation` | `repair-traceability` |
| `/jira-components` | `jira-administration` | `components` |
| `/jira-instance-migration` | `jira-administration` | `instance-migration` |
| `/sync-ai-memory` | `sync-ai-context` | `sync` |

What each one does:

| Command                 | Purpose                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `/adapt-framework`      | Adapt KATA architecture + config/CI/MCP to target stack (10-phase idempotent flow; no writes before approval; re-run reports a GENERIC/ADAPTED checklist). Covers `tests/`, `api/schemas/`, `config/`, `.agents/project.yaml`, `.env`, CI workflows, MCP registry, `dbhub.toml`, `allurerc.mjs`, `kata-manifest`. Hands off to `/sync-ai-memory` for docs. |
| `/sync-ai-memory`       | Sync all AI-critical docs (`README.md`, `AGENTS.md`, `INSTALLER.md`, `CONTEXT.md`, `docs/**`) against current `.context/` and `package.json`. |
| `/business-data-map`    | Refresh `.context/business/business-data-map.md` (entities, flows, state machines).                                                           |
| `/business-feature-map` | Refresh `.context/business/business-feature-map.md` (feature catalog, CRUD matrix, integrations).                                             |
| `/business-api-map`     | Refresh `.context/business/business-api-map.md` (auth model, critical endpoints, architecture).                                               |
| `/master-test-plan`     | Refresh `.context/master-test-plan.md` (what to test and why).                                                                                |
| `/break-down-tests`     | Plain-English breakdown of automated tests for a module / spec.                                                                               |
| `/fix-traceability`     | Repair broken US-ATP-ATR-TC traceability links in the TMS.                                                                                    |
| `/jira-components`      | Derive the target app's functional modules from its source and reconcile the Jira project's Components against them through a plan file you approve (drives `bun run jira:components`; renames preserve issue assignments, creates are additive).             |
| `/jira-instance-migration` | Repoint the repo at a new Atlassian instance (`.env` + `.agents/project.yaml` + machine-global `acli` session) and regenerate the `.agents/` catalogs the migration invalidated.        |

<br />

## Variables system

The `.agents/` directory hosts a 4-syntax variable system used by every skill and command.

| Syntax                         | Purpose                                      | Resolves from                                             |
| ------------------------------ | -------------------------------------------- | --------------------------------------------------------- |
| `{{VAR_NAME}}`                 | Static project value (flat or env-scoped)    | `.agents/project.yaml`                                    |
| `{{environments.<env>.<var>}}` | Explicit cross-env reference                 | `.agents/project.yaml` -> `environments.<env>.<var>`      |
| `<<VAR_NAME>>`                 | Session/runtime value (e.g. `<<ISSUE_KEY>>`) | Computed by the calling prompt at runtime                 |
| `{{jira.<slug>}}`              | Jira custom field reference                  | `.agents/jira-required.yaml` + `.agents/jira-fields.json` |

See `.agents/README.md` for the full contract.

**Validation scripts:**

```bash
bun run vars:check         # Every {{VAR}} and {{jira.*}} reference resolves
bun run jira:sync-fields   # Discover Jira custom fields -> .agents/jira-fields.json
bun run jira:check         # Validate jira-required.yaml against jira-fields.json
```

<br />

## TMS Integration (Jira/Xray)

Two TMS modalities are supported out of the box:

- **Modality jira-xray**: full Xray entities (Test, Test Plan, Test Execution, Test Run, Pre-Condition). Primary tooling is the `/xray-cli` skill plus `/acli` for generic Jira issues.
- **Modality jira-native (no Xray)**: ATP/ATR live as Story custom fields + comment mirrors; TCs live as Jira `Test` issues. All TMS operations fall through to `/acli`. See `.agents/skills/test-documentation/references/jira-setup.md`.

For how skills resolve `[ISSUE_TRACKER_TOOL]` and `[TMS_TOOL]` tags to concrete CLIs or MCPs, see `AGENTS.md` §6 Tool Resolution.

### Configuration

1. Get Xray API credentials from Jira
2. Add to `.env`:

```bash
XRAY_CLIENT_ID=your-client-id
XRAY_CLIENT_SECRET=your-client-secret
XRAY_PROJECT_KEY=YOUR-PROJECT
AUTO_SYNC=true

# Key of the STR (not the STP) that results are imported onto — the Test Execution
# linked to the sprint's STP, under the "QA Test Artifacts" epic. Leave it empty and
# every run mints a brand-new, unparented Test Execution instead.
STP_EXECUTION_KEY=YOUR-PROJECT-194
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

<br />

## Customization Guide

### 1. Update Project Identity

Edit these files:

- `package.json` — name, description, repository
- `AGENTS.md` — the canonical AI memory, loaded by Claude Code, OpenCode and Codex alike. Never edit `CLAUDE.md`: it is the generated one-line shim that points here
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

### 5. Adapt the Framework

Once `.context/` exists, run `/adapt-framework` to wire the KATA architecture to your stack — auth, variables, OpenAPI facades, CI workflows, and the MCP registry. It runs a 10-phase idempotent flow (no writes before your approval) and, on re-run, reports a GENERIC / ADAPTED checklist of what is still example-project boilerplate. After it passes, you can start writing automated tests.

<br />

## Companion repo

The development side lives in [agentic-dev-boilerplate](https://github.com/upex-galaxy/agentic-dev-boilerplate) — project foundation, design system, sprint development, deploys. Same `.agents/` variable system, same `agentskills.io` layout. Pair them or use one.

<br />

## Multi-harness architecture: one source, three consumers

This repo runs on **Claude Code, OpenCode, and Codex (CLI + Desktop)**. There is exactly one copy of every instruction and every skill. Where the harnesses genuinely differ (MCP file format, hook API, whether slash commands exist at all) each keeps a thin versioned adapter. Nothing is duplicated.

> Visual walkthrough, including what happens when you update a project created before this change: [**Una fuente, tres harnesses**](https://upex-galaxy.github.io/agentic-qa-boilerplate/harnesses.es.html) (Spanish, published page with diagrams).

| Surface | Claude Code | OpenCode | Codex CLI + Desktop |
| ------- | ----------- | -------- | ------------------- |
| **Instructions** | `CLAUDE.md` → `@AGENTS.md` **[generated shim]** | `AGENTS.md` (native) | `AGENTS.md` (native) |
| **Skills** | `.claude/skills` **[generated alias]** | `.agents/skills/` (native) | `.agents/skills/` (native) |
| **Commands** | `.claude/commands/*.md` **[generated]** | `.opencode/commands/*.md` **[generated]** | none: invoke the skill + mode directly |
| **Hook** | `.claude/settings.json` → `UserPromptSubmit` | `.opencode/plugins/personality-reinject.js` | `.codex/hooks.json` → `UserPromptSubmit` |
| **MCP** | `.mcp.json` | `opencode.jsonc` | `.codex/config.toml` |

- **Instructions.** `AGENTS.md` is the only instruction body. OpenCode and Codex load it natively; Claude Code loads `CLAUDE.md`, which is exactly `@AGENTS.md` plus one newline: a documented import rather than a symlink, so it survives a Windows checkout. Operational prose in the shim is structural drift, and `/sync-ai-memory` stops rather than propagating it.
- **Skills.** All 19 skills live committed in `.agents/skills/`, and the project-level community skills install into the same store. OpenCode and Codex read it directly; Claude Code reaches it through `.claude/skills`, a POSIX symlink (Windows junction) that is generated and gitignored: never committed, never hand-edited. Each skill still declares `compatibility: [claude-code, copilot, cursor, codex, opencode]` per the [agentskills.io](https://agentskills.io) spec, and hosts without slash triggers auto-activate from the same `description` field.
- **Commands.** The 10 slash commands are transport, not workflow: generated from `.agents/compatibility/command-aliases.json`, 7 lines each. A wrapper that grows a body fails the check as `contains workflow prose`.
- **Hook.** `.agents/hooks/personality-reinject.mjs` holds the contract text once. Claude and Codex run it as a command hook; OpenCode imports the constant from a thin plugin.
- **MCP.** Every server declared in `.mcp.json` must exist in the other two configs with the same `.env` dependencies. Parity is checked semantically: each native format (JSON / JSONC / TOML) is normalized into a common shape, then compared on the `.env` variables each server depends on and on its literal settings, so a server missing from one host, or present in one host only, is a failure. The six the boilerplate ships (`context7`, `tavily`, `playwright`, `dbhub`, `openapi`, `postman`) additionally get a strict per-host shape check when declared; a downstream project with a different set passes on the generic check alone. Codex cannot expand `${VAR}`, so its adapter names every secret by variable (`bearer_token_env_var` for the two HTTP servers, `env_vars` for `openapi`).

### Regenerating and verifying

Bold `[generated]` cells above are output. Edit the source, then regenerate:

| Generated artifact | Its source | Regenerate |
| ------------------ | ---------- | ---------- |
| `CLAUDE.md` (one-line `@AGENTS.md` shim) | `AGENTS.md` | `bun run agents:compat` |
| `.claude/skills` (POSIX symlink / Windows junction) | `.agents/skills/` | `bun run agents:compat` |
| One Claude + one OpenCode wrapper per alias (10 upstream, plus any project-declared) | `.agents/compatibility/command-aliases.json`, overlaid by the optional `command-aliases.project.json` | `bun run agents:compat` |

```bash
bun run agents:compat         # regenerate every derived harness artifact, then check
bun run agents:compat:check   # validate the whole contract (also runs in repo:check + pre-push)
```

**Project-owned slash commands** live in `.agents/compatibility/command-aliases.project.json` (same schema as the upstream manifest, optional, never synced by `bun run up`). Upstream aliases are read first; an overlay entry with the same `alias` replaces it, a new `alias` is added, and `wrapperHosts` always come from the upstream manifest. A wrapper file under `.claude/commands/` or `.opencode/commands/` that neither manifest produced fails the check by name (`Command wrapper not declared in any manifest: <path>`); declare it in the overlay or delete it, the repair never deletes for you.

`agents:compat:check` covers the shim bytes, the alias target, both wrapper sets byte-for-byte against the merged manifest, the hook adapters, and MCP parity. It prints the alias status line on every run (created, OK, deferred until the migration commit, missing) and groups the errors per surface (instructions, alias, wrappers, hooks, MCP), so "alias pending commit" and "MCP drift" never read as one flat failure. It runs inside `bun run repo:check`, in the pre-push hook, and conditionally in pre-commit. `bun run setup:doctor` reports the same surfaces (the wrapper and server counts come from the merged manifest and from `.mcp.json`) plus **Codex repository trust**: project `.codex/` config and hooks load only in a trusted repo, and that is runtime state no file read can verify.

The `.agents/` variable system is harness-agnostic and unchanged across all three.

<br />

## Future hooks

Room for per-phase model routing, an explicit skill registry, Engram-style cross-session memory, and CI-validated cross-agent portability. Notes in `AGENTS.md`.

<br />

## Contributing

1. Load the `/test-automation` skill and read its `references/kata-architecture.md`
2. Follow the automation standards referenced by that skill
3. Use conventional commits
4. Ensure all tests pass before PR

<br />

## License

MIT — see [`LICENSE`](LICENSE).

<br />

---

<div align="center">

<sub><b>You are here</b> — QA boilerplate repo overview for visitors · <b>Read time</b> ~5 min · <b>Next</b>: <code>bunx create-agentic-qa@latest &lt;your-repo-name&gt;</code> to bootstrap · <code>bun run onboarding</code> for the visual repo tour · <a href="INSTALLER.md"><code>INSTALLER.md</code></a> for installer details.</sub>

</div>
