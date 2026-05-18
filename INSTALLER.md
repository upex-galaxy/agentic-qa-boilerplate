# The installer — what `bun run setup` configures

> **Audience**: QA engineers cloning `agentic-qa-boilerplate` for the first time, or anyone wanting to understand what `bun run setup` configures (gentle-ai, community skills, MCPs, local skills) and what is optional.
> **Read time**: 8 minutes.
> **Status**: updated 2026-05-17 — 5-phase TUI flow, step idempotency, GitHub repo step.
>
> This document is the **contract that `cli/install.ts` implements**. The four layers of the workstation — gentle-ai (Engram + SDD), community skills via `bunx skills`, locally committed workflow skills, and the 7 canonical MCPs — are documented below in that order.

---

## 5-phase install flow

`bun run setup` runs in 5 named phases. Each phase is labelled in the terminal output. The installer is **idempotent**: every step writes a timestamp to `.template/installer.state.json` on success, and re-runs skip completed steps automatically.

### Phase 1 — DETECTION

Probes the environment before touching anything. Detects gentle-ai (version + compatibility), loads or creates `.template/installer.state.json`, and prompts for agent selection (Claude Code / OpenCode). Exits early if no agents are installed or if the user asks for the gentle-ai install guide.

### Phase 2 — INSTALLATION

Downloads and installs all software dependencies:

- `bun install` — project Node/Bun packages including `@playwright/test`
- `bun run pw:install` — Playwright browser binaries (~300 MB Chromium)
- `gentle-ai install` — Engram persistent memory + 13 SDD/helper skills (one batched call per agent)
- `bunx skills add` — project-level skills (`playwright-cli`, `playwright-best-practices`) and user-level skills (8 cross-project utilities)

### Phase 3 — CONFIGURATION

Wires runtime configuration:

- `.env` population — discovers `${VAR}` / `{env:VAR}` placeholders in `.mcp.json` and `opencode.jsonc`, then prompts for values not already set
- `direnv allow` — optional; auto-loads `.env` on `cd`
- GitHub repository — interactive `gh repo create` (optional); hydrates `state.github` from an existing remote if already wired

### Phase 4 — VERIFICATION

Validates the environment is usable:

- External CLI table — `which`-checks all 6 CLIs (`bun`, `gh`, `acli`, `playwright-cli`, `jq`, `resend`) and prints a status table with purpose and install hint for missing entries
- State persistence — writes updated `.template/installer.state.json`

### Phase 5 — INITIAL CONFIGURATION

Interactive post-install configuration steps. Skipped automatically when no TTY is detected (CI / non-interactive mode):

- `agents:setup` — populates `.agents/project.yaml` with project identity, Jira URL, environments
- `acli` auth probe — establishes an `acli` session if credentials are available
- `jira:sync-fields` — Jira auth loop (up to 5 attempts) then syncs custom field IDs
- `jira:sync-workflows` — syncs workflow statuses and transitions
- `jira:check` — validates `.agents/jira-required.yaml` against the workspace

Each step in Phase 5 records its completion in `state.postInstall` so re-runs skip it on the next `bun run setup`.

---

## Idempotency — re-running setup safely

Every step writes an ISO timestamp to `state.steps[<key>]` in `.template/installer.state.json`. A re-run skips a step when its timestamp is present.

### Force flags

| Method | Effect |
|---|---|
| `--force` CLI flag | Clear all step timestamps — re-run everything |
| `--force-step <key>` | Clear one step (e.g. `--force-step 5-deps-install`) |
| `INSTALL_FORCE_ALL=1` | Same as `--force` |
| `INSTALL_FORCE_<UPPER_KEY>=1` | Same as `--force-step` (dashes become underscores) |

Step keys that participate in idempotency (each writes an ISO timestamp on success): `5-deps-install`, `6-playwright`, `8-skills-gentle-ai`, `9-skills-community-project`, `9-skills-community-global`, `12-api-bootstrap`, `13-github-repo`. Phase 1 detection steps (`1-repo-verify`, `2-gentle-ai-detect`, `3-gentle-ai-install`, `4-agent-detect`) and Phase 4 verification/persistence (`10-mcp-env`, `11-verify-clis`, `14-state-write`) always re-run since they probe live state. Phase 5 post-install steps (`agents:setup`, `acli:auth`, `jira:sync-fields`, `jira:sync-workflows`, `jira:check`) track status under `state.postInstall.*` rather than `state.steps`.

---

## Before you run setup — prerequisites

The installer is self-diagnosing: every stage prints the exact install URL or command when it detects something missing. But you will iterate faster if you front-load the hard blockers below. For the same checklist with brief tables, see the top of [`README.md`](./README.md#prerequisites).

### Hard blockers — installer exits 1 if missing

| Tool                                                                               | Min version | Enforced at                                 | Message you see on failure                                                                      |
| ---------------------------------------------------------------------------------- | ----------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Bun**                                                                            | `>= 1.0.0`  | `bun run setup:doctor --preflight` (Step 0) | `✗ Preflight failed · Bun X.Y.Z is too old (need >= 1.0.0) · Fix: bun upgrade`                  |
| **`node_modules/@inquirer/prompts`** (proxy for `bun install`)                     | —           | Preflight (Step 0)                          | `✗ Preflight failed · Missing node_modules/@inquirer/prompts · Fix: bun install`                |
| **Agent CLI** — Claude Code (`~/.claude/`) **or** OpenCode (`~/.config/opencode/`) | latest      | `install.ts:556` (Step 4)                   | `✗ No agents detected. Install Claude Code or OpenCode and re-run.` followed by both docs URLs  |
| `git`                                                                              | any         | Scaffolder (`runners.ts:23`) + Husky hooks  | `ENVIRONMENT · git is required but not found on PATH. · Install: https://git-scm.com/downloads` |
| `tar`                                                                              | any         | Scaffolder (`download.ts`)                  | `ENVIRONMENT · tar is required to extract the template tarball.`                                |

The agent-CLI check is the gotcha that bites first-timers most often: a missing `gh` or `acli` just yields a warning later, but a missing agent CLI hard-stops Step 4. Install Claude Code or OpenCode first, then run `bun run setup`.

### Quasi-required — installer warns and offers install commands

| Tool          | Min version | Enforced at                   | What happens on miss                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------- | ----------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **gentle-ai** | `>= 1.26.5` | `install.ts:500-545` (Step 2) | Prints `gentle-ai not detected on PATH.` then offers two paths: (a) show install commands (`brew install gentle-ai` on macOS, `go install github.com/Gentleman-Programming/gentle-ai/cmd/gentle-ai@latest` on Linux) and exit, or (b) continue without gentle-ai. Older-than-min version triggers `gentle-ai X.Y.Z is older than required 1.26.5. Upgrade with: gentle-ai update` and the setup continues with the warning. |

If you skip gentle-ai, Engram persistent memory + the SDD spec-driven loop + judgment-day + issue-creation skills are NOT installed. The locally committed QA workflow skills (`/sprint-testing`, `/test-automation`, `/test-documentation`, `/regression-testing`, `/agentic-qa-core`) keep working, and the 7 canonical MCPs are still configured.

### Per-skill CLIs — lazy-required, non-blocking at setup

These CLIs are **not optional** for the workflow — each one is consumed by a specific skill (`gh` for `/git-flow-master` + `/regression-testing`, `acli` for `/acli` + `/sprint-testing` + `/test-documentation`, `playwright-cli` for `/playwright-cli`, `resend` for `/resend-cli`, `jq` for `acli ... --json | jq ...` pipelines). The installer cannot guess which skills you will run, so it ships them as **lazy-required**: a missing binary surfaces as a warning during Step 10 but never blocks setup. Install them up front if you plan to use the whole stack, or on-demand when the owning skill surfaces a missing-binary error.

The check itself is a **PATH probe** (`which <name>` on POSIX, `where <name>` on Windows — see `install.ts:403`). Presence only — no version compare, no auto-install.

`install.ts` Step 10 (`verifyExternalClis`) iterates the `EXTERNAL_CLIS` array (`install.ts:185`) and prints a per-CLI status table:

```text
CLI              Status      Purpose
────────────────────────────────────────────────────────────────────────────────
bun              found       Runtime for every script
gh               missing     GitHub PR / Actions workflows (`/git-flow-master`, `/regression-testing`)
                            docs:  https://github.com/cli/cli#installation
acli             missing     Jira/Confluence from terminal (`/acli`, ...)
                            docs:  https://developer.atlassian.com/cloud/acli/guides/install-acli/
playwright-cli   missing     Agent-driven browser automation (`/playwright-cli` skill)
                            quick: bun add -g @playwright/cli@latest
                            docs:  https://playwright.dev/agent-cli/introduction
resend           missing     Email testing flows (`/resend-cli` skill)
                            docs:  https://resend.com/docs/cli
jq               missing     JSON parsing in `acli` Jira pipelines (`acli ... --json | jq ...`)
                            docs:  https://jqlang.github.io/jq/download
```

Missing per-skill CLIs do not exit the installer. Install them lazily when the owning skill surfaces a missing-binary error, or eagerly if you already know which workflow you want.

### Convenience opt-ins — never required

| Tool     | What it buys you                                                                                                                                                                                                                               | Where the installer surfaces it                                                                                                                                                                                                                                                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `direnv` | Auto-loads `.env` on `cd` so the bare `claude` / `opencode` binaries see MCP credentials. Without it, the `bun run claude` / `bun run opencode` wrappers (powered by `dotenv-cli`, already a project devDep) do the same thing cross-platform. | `cli/doctor.ts` (`detectDirenv`) reports `direnv.installed`, `version`, `envrc_allowed`, `hook_in_rc`. The installer offers `direnv allow` + a shell-hook nudge. **Windows users**: skip — PowerShell support is experimental (direnv 2.37+); Git Bash works but the wrapper is simpler. The installer offers the prompt anyway; decline freely. |

### MCP credentials — 8 env vars filled into `.env`

`cli/doctor.ts:39` declares `REQUIRED_VARS` consumed by the 7 canonical MCPs. Missing keys do not block setup, but every `bun run setup:doctor` will list them under `pending_actions` with the canonical `where` URL (token-generation page) until they are filled.

```
TAVILY_API_KEY                                  → https://app.tavily.com/ → API keys
ATLASSIAN_URL, ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN → https://id.atlassian.com/manage-profile/security/api-tokens
API_BASE_URL, OPENAPI_SPEC_PATH, API_TOKEN      → your backend admin / API portal
POSTMAN_API_KEY                                 → https://postman.com → settings → API keys
```

### Where to verify your status

| Command                            | What it does                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `bun run setup:doctor --preflight` | Fast Bun / deps check only — exit 0 if green, 1 with explicit fix command otherwise                                  |
| `bun run setup:doctor`             | Full report: env vars, deps, Playwright browsers, direnv hook, MCP config files, pending actions with `where` URLs   |
| `bun run setup:doctor --json`      | Same as above as machine-readable JSON for an agent to consume                                                       |
| `bun run setup`                    | Re-run the interactive installer end-to-end (idempotent — gentle-ai snapshots configs, MCP overwrites are confirmed) |

---

## Running setup from an AI agent

Most users today ask an AI (Claude Code, OpenCode, Cursor, …) to drive the setup instead of running it by hand. The installer is built for both flows; the AI path uses a few specific entry points:

### `bun run setup:doctor` — read-only health check

The fastest way for an AI to figure out **what's wired and what's missing** without changing anything:

```bash
bun run setup:doctor          # human-readable summary
bun run setup:doctor --json   # machine-readable, parse with jq / agent
```

Exit code: `0` when everything is green, `1` when any pending action remains. JSON shape:

```json
{
  "status": "needs-action",
  "platform": "linux",
  "shell": "/usr/bin/bash",
  "is_tty": true,
  "env_vars": { "TAVILY_API_KEY": "set", "POSTMAN_API_KEY": "missing", ... },
  "direnv": { "installed": true, "version": "2.25.2", "envrc_allowed": true, "hook_in_rc": true, "rc_file": "/home/user/.bashrc" },
  "pending_actions": [
    { "type": "credential", "target": "POSTMAN_API_KEY", "hint": "Postman API key for Postman MCP", "where": "https://postman.com → settings → API keys" },
    { "type": "shell_hook", "target": "~/.bashrc", "hint": "Add direnv hook ...", "where": "eval \"$(direnv hook bash)\"" }
  ]
}
```

`pending_actions[].type` is one of: `credential` · `shell_hook` · `system_install` · `shell_command`. The AI iterates the list and picks the right tool per type:

| type             | Who handles it | How                                                                                                                             |
| ---------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `credential`     | **User**       | AI asks the user for the value in chat (e.g. "paste your Tavily key from https://app.tavily.com"). Then AI writes it to `.env`. |
| `shell_hook`     | **AI**         | AI appends the `where` line to the `target` rc file with its Edit/Bash tool. Trivial.                                           |
| `system_install` | **User**       | AI shows the `where` command; the user runs it (brew/winget/apt may prompt for admin password).                                 |
| `shell_command`  | **AI**         | AI runs the `target` command via Bash.                                                                                          |

### What an AI **cannot** do (hard limits)

- **Generate API tokens** — Tavily / Atlassian / Postman / OpenAPI keys all require an interactive web login + 2FA. The user creates and pastes them; the AI never sees the generation flow.
- **Decide business config** — e.g. `TEST_ENV=local` vs `staging`, which modules to automate first, etc. The AI suggests; the user decides.
- **Execute privileged installs cleanly** — `brew install`, `winget install`, `apt install` may show a sudo/admin prompt that lives outside the agent's terminal. The AI runs the command but the user clicks "allow".

### `bun run setup --non-interactive` (or just `bun run setup` without a TTY)

The installer auto-detects no-TTY (an agent invoking it without a terminal) and silently switches to `--non-interactive`. Prompts skip with their default answer. The closing summary lists pending env vars and next steps — same data the doctor exposes. Use this path when the AI wants to run the full setup batch:

```bash
INSTALL_AGENTS=claude-code,opencode \
  TAVILY_API_KEY=tvly-... \
  ATLASSIAN_URL=... \
  ATLASSIAN_EMAIL=... \
  ATLASSIAN_API_TOKEN=... \
  bun run setup --non-interactive
```

Then `bun run setup:doctor --json` to confirm.

### Skip flags (per-step opt-out)

| Env var                       | Effect                           |
| ----------------------------- | -------------------------------- |
| `INSTALL_SKIP_GENTLE_AI=1`    | Treat gentle-ai as skipped       |
| `INSTALL_SKIP_DEPS=1`         | Skip `bun install`               |
| `INSTALL_SKIP_PLAYWRIGHT=1`   | Skip `bun run pw:install`        |
| `INSTALL_SKIP_AGENTS_SETUP=1` | Skip `bun run agents:setup`      |
| `INSTALL_SKIP_COMMUNITY=1`    | Skip `bunx skills add` step      |
| `INSTALL_SKIP_JIRA=1`         | Skip optional Jira bootstrap     |
| `INSTALL_SKIP_API=1`          | Skip optional API auth bootstrap |
| `INSTALL_SKIP_DIRENV=1`       | Skip direnv detection / autoload |

### Force flags (re-run completed steps)

| Flag / Env var                           | Effect                                         |
| ---------------------------------------- | ---------------------------------------------- |
| `--force`                                | Clear all step timestamps — re-run everything  |
| `--force-step <key>`                     | Re-run one step by key                         |
| `INSTALL_FORCE_ALL=1`                    | Same as `--force`                              |
| `INSTALL_FORCE_GENTLE_AI=1`              | Re-run gentle-ai skill install                 |
| `INSTALL_FORCE_COMMUNITY=1`              | Re-run community skill install                 |
| `INSTALL_FORCE_GITHUB=1`                 | Re-run GitHub remote setup                     |
| `INSTALL_FORCE_AGENTS_SETUP=1`           | Re-run agents:setup                            |

---

## Launching the agent after setup

`bun run setup` finishes with two recommended ways to start an agent so MCP env vars (e.g. `TAVILY_API_KEY`, `ATLASSIAN_API_TOKEN`) get loaded from `.env`:

| Method                                              | Platform                                                                                      | One-time setup                                                                                                                                          | Usage                                                 |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **`bun run claude` / `bun run opencode`** (default) | Windows, macOS, Linux                                                                         | None — `dotenv-cli` is a project devDep                                                                                                                 | `bun run claude` from the repo root                   |
| **direnv autoload** (optional)                      | macOS, Linux, **Windows** (Git Bash recommended; PowerShell experimental, needs direnv 2.37+) | Install direnv (`brew install direnv` / `apt install direnv` / `winget install direnv`) + add hook to your shell rc, then installer runs `direnv allow` | Just `claude` or `opencode` from anywhere in the repo |

### direnv hook per shell

| Shell      | Line to add                               | File                                             |
| ---------- | ----------------------------------------- | ------------------------------------------------ |
| bash       | `eval "$(direnv hook bash)"`              | `~/.bashrc` (also works for Git Bash on Windows) |
| zsh        | `eval "$(direnv hook zsh)"`               | `~/.zshrc`                                       |
| fish       | `direnv hook fish \| source`              | `~/.config/fish/config.fish`                     |
| PowerShell | `Invoke-Expression "$(direnv hook pwsh)"` | `$PROFILE` (requires direnv 2.37+, experimental) |

`.mcp.json` (Claude Code) and `opencode.jsonc` are committed with `${VAR}` / `{env:VAR}` placeholders. Real values live in `.env` (gitignored). If a server returns 401/403 at first call, the matching env var is missing — see `CLAUDE.md` Critical Rule #11 (stop, fix `.env`, restart the agent session).

### Optional cosmetic polish

Pure UX, zero behavioral change. Skip without consequence.

| Agent           | Tool                                                        | How                                                                                                                                                                                                                                                                                             |
| --------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude Code** | [`ccstatusline`](https://github.com/sirmalloc/ccstatusline) | `bunx -y ccstatusline@latest` — interactive TUI to customize the Claude Code status line (model, tokens, context %, git branch, etc.). **Run in a plain terminal with no active agent session**; the configurator owns the terminal while it runs and will collide with a live Claude Code TUI. |
| **OpenCode**    | `opencode-subagent-statusline` plugin                       | Already enabled in `opencode.jsonc` (`"plugin": [..., "opencode-subagent-statusline"]`). Shows the active subagent in the OpenCode status line. Nothing to install — `bun run opencode` picks it up.                                                                                            |

### Optional UX upgrades

Two community tools change how the agent talks and how the terminal looks. Both are recommended but **never auto-installed** — they are user-level scope and modify environments outside this repo.

#### caveman — token compression skill

A user-level Claude Code skill that compresses agent output by ~65-75% by talking like caveman: drop articles, fillers, and pleasantries; keep technical substance exact. Code, commits, PRs, and security warnings always render in normal English (built-in boundary).

- Levels: `lite` | `full` (this repo's default) | `ultra` | `wenyan`
- Reverse triggers (any of these returns the agent to verbose mode): `normal mode`, `habla normal`, `stop caveman`, `speak normally`, `be verbose`, `más detallado`
- Requires Node >= 18

Install:

- macOS / Linux: `curl -fsSL https://raw.githubusercontent.com/JuliusBrussee/caveman/main/install.sh | bash`
- Windows: `irm https://raw.githubusercontent.com/JuliusBrussee/caveman/main/install.ps1 | iex`

Docs: https://github.com/JuliusBrussee/caveman

#### ccstatusline — Claude Code statusline TUI

Configure the bottom statusline of Claude Code (model name, token usage, git branch, usage stats, etc.). Cosmetic only — no impact on agent behavior.

> **WARNING**: run `ccstatusline` in a SEPARATE terminal with NO agent session active. Concurrent TUIs fight over stdin and break the agent prompt.

Install + configure: `bunx -y ccstatusline@latest`

Docs: https://github.com/sirmalloc/ccstatusline

---

## What is gentle-ai and why this repo uses it

[gentle-ai](https://github.com/Gentleman-Programming/gentle-ai) is a user-level installer that configures AI agents (Claude Code, OpenCode, Cursor, etc.) with a curated set of skills, an MCP-based persistent memory layer (Engram), and an SDD (Spec-Driven Development) orchestrator. It does not install agents themselves — it tunes the agents you already have.

This repo treats gentle-ai as a **base global "quasi-must-have"**. The recommended onboarding (`bun run setup`) installs it if missing, then layers Engram + 10 SDD skills + 2 universal helpers (judgment-day, issue-creation) + skill-registry on top of your agent. The result is one consistent skillset across every QA repo on your machine that follows this model.

The integration is **not strict**. If you choose to skip gentle-ai, the repo still works: workflow skills committed locally (`/sprint-testing`, `/test-automation`, `/test-documentation`, `/regression-testing`, `/agentic-qa-core`, etc.) keep functioning, and the 7 canonical MCPs are still configured. What you lose is the SDD spec-driven loop, persistent cross-session memory, adversarial review, and the issue-filing helper. Section "How to opt out" below details the trade-off.

---

## What gets installed via gentle-ai

When `bun run setup` runs the gentle-ai branch (one batched call per agent — `gentle-ai install --agent <agent> --components engram,sdd,skills --skills <csv>` covers the engram component plus all 13 skills below):

### Engram (MCP component, not a skill)

| Slug     | Type      | What it does                                                                                                |
| -------- | --------- | ----------------------------------------------------------------------------------------------------------- |
| `engram` | Component | Persistent memory across sessions. Auto-saves decisions, bugs, conventions; auto-recalls on session resume. |

### SDD skills (11)

| Slug             | Brief description                                                                |
| ---------------- | -------------------------------------------------------------------------------- |
| `sdd-init`       | Bootstrap SDD context, detect stack, activate Strict TDD if testing is available |
| `sdd-explore`    | Investigate codebase before committing to a change                               |
| `sdd-propose`    | Create a change proposal (intent, scope, approach)                               |
| `sdd-spec`       | Write requirements + scenarios as delta specs                                    |
| `sdd-design`     | Technical design (architecture decisions, component boundaries)                  |
| `sdd-tasks`      | Break a change into reviewable implementation tasks                              |
| `sdd-apply`      | Implement tasks following specs and design                                       |
| `sdd-verify`     | Validate implementation against specs (tests, edge cases, perf)                  |
| `sdd-archive`    | Sync delta specs into main specs and close the change                            |
| `sdd-onboard`    | Guided end-to-end SDD walkthrough on a real codebase                             |
| `skill-registry` | Build the compact project-standards registry from installed skills               |

### Universal helpers (2)

| Slug             | Brief description                                                         |
| ---------------- | ------------------------------------------------------------------------- |
| `judgment-day`   | Adversarial parallel review — 2 independent judges review the same target |
| `issue-creation` | Issue filing workflow (bug + feature templates, issue-first enforcement)  |

> The installer dispatches ONE batched call per agent — `gentle-ai install --agent <agent> --components engram,sdd,skills --skills <comma-separated-slug-list>`. There is no per-skill loop and no `--yes` flag (gentle-ai's `install` subcommand uses Go's stdlib `flag` package and exposes only `--agent(s)`, `--component(s)`, `--skill(s)`, `--persona`, `--preset`, `--sdd-mode`, `--dry-run`). Re-runs are safe: gentle-ai snapshots existing config files before overwriting (compressed tar.gz, deduped, last 5 retained). They DO re-apply, they don't skip.

### Why not `cognitive-doc-design` or `comment-writer`?

Both ship via gentle-ai but are dev-writing-leaning. QA reporting tone is owned vertically by `/sprint-testing` (QA comment formats, bug report structure) and `/regression-testing` (stakeholder reports). Adding the dev-writing helpers would create overlap, not value.

---

## What gets installed via `bunx skills` CLI

Independent of gentle-ai, the installer also runs the official Anthropic `bunx skills add` CLI to fetch community skills from upstream repos. Two lists, both defined as `const` arrays in `cli/install.ts`:

### Project-level (2 skills)

Installed into `.claude/skills/` via `bunx skills add` (project mode). Not committed — `cli/install.ts` re-fetches them on every install so we always pick up upstream fixes. They are critical to the QA stack and must travel with every clone of the repo.

| Slug                        | Source                                         | Why project-level                                                                                               |
| --------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `playwright-cli`            | `microsoft/playwright-cli`                     | Browser automation CLI used by `/sprint-testing` and `/test-automation` as the primary `[AUTOMATION_TOOL]`.     |
| `playwright-best-practices` | `currents-dev/playwright-best-practices-skill` | Patterns / anti-flaky / axe-core / fixtures reference. Auto-loaded by `/test-automation` during the Code phase. |

### User-level (global, 7 skills)

Installed with `bunx skills add <package> [--skill <name>] --global --yes` and useful across most projects regardless of stack. QA-tuned subset of the dev universal layer — design/UI skills (n8n-skills, emil-design-eng, ui-ux-pro-max) live only in the dev repo since QA does not author UI or automation flows.

| Slug                  | Source                        | Why user-level                                                                                                                                   |
| --------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `skill-creator`       | `anthropics/skills`           | Author/edit skills — useful in any repo                                                                                                          |
| `find-skills`         | `vercel-labs/skills`          | Discover installable skills — universal                                                                                                          |
| `gh-cli`              | `github/awesome-copilot`      | GitHub CLI helper for CI / PRs / releases — universal                                                                                            |
| `github-actions-docs` | `xixu-me/skills`              | GitHub Actions workflow reference — universal                                                                                                    |
| `brainstorming`       | `obra/superpowers`            | Pre-implementation ideation (framework features, test design edge cases) — universal                                                             |
| `cli-printing-press`  | `mvanhorn/cli-printing-press` | CLI tooling for API-as-CLI testing + framework utility scripts. Full functionality requires Go 1.26.3+; works standalone with degraded features. |
| `html-ppt`            | `lewislulu/html-ppt-skill`    | HTML presentations for sprint planning / retro / demo decks — universal                                                                          |

### Skipping or re-running

Run `INSTALL_SKIP_COMMUNITY=1 bun run setup` to skip the community step entirely (the previous behaviour is preserved). Re-runs are idempotent: already-installed skills are detected via `state.skills["community:<level>:<slug>"] === "installed"` in `.template/installer.state.json` and skipped silently.

If a skill fails to install (e.g., upstream repo restructured), the failure is recorded as `failed` in the state file and surfaced in the closing summary, but the installer continues — community skills are best-effort, not blocking.

---

## What stays local (committed in this repo)

Skills that are workflow-specific to this boilerplate live in `.claude/skills/` and are committed to the repo. They install with the clone — no external installer required.

| Skill                   | Trigger                       | Why it stays local                                                                                                                                                        |
| ----------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agentic-qa-core`       | (auto, cited by other skills) | Foundation: passive reference host for briefing template, dispatch patterns, orchestration doctrine, skill-composition strategy                                           |
| `agentic-qa-onboard`    | `/agentic-qa-onboard`         | First-time orientation tour (this is the entry point for new contributors)                                                                                                |
| `project-discovery`     | `/project-discovery`          | 4-phase reverse-engineering of a target project (Constitution → Specification)                                                                                            |
| `sprint-testing`        | `/sprint-testing`             | Stages 1-3: per-ticket manual QA loop (planning, execution, reporting)                                                                                                    |
| `test-documentation`    | `/test-documentation`         | Stage 4: TMS test-case authoring + ROI prioritization (Jira/Xray bridge)                                                                                                  |
| `test-automation`       | `/test-automation`            | Stage 5: KATA + Playwright + TS test authoring (plan → code → review)                                                                                                     |
| `regression-testing`    | `/regression-testing`         | Stage 6: CI suite execution, failure classification, GO/NO-GO verdict                                                                                                     |
| `framework-development` | `/framework-development`      | Gateway for chaining `/sdd-*` skills. Use for evolving the boilerplate itself (KATA bases, fixtures, `cli/`, `scripts/`, `api/schemas/` pipeline). NOT for per-ticket QA. |
| `acli`                  | `/acli`                       | Atlassian CLI wrapper for Jira/Confluence terminal work                                                                                                                   |
| `xray-cli`              | `/xray-cli`                   | Xray Cloud TMS CLI (test creation, executions, JUnit/Cucumber import)                                                                                                     |
| `git-flow-master`       | (auto on git intents)         | End-to-end Git operator (branch, commit, push, PR, conflict, chained-PR)                                                                                                  |

These skills evolve with the repo and are versioned in git. The split is intentional: gentle-ai owns the **horizontal** ecosystem (apply across all your QA repos), this repo owns the **vertical** workflow (specific to the QA stages 1-6 pipeline).

---

## Keeping the framework up to date — `.template/boilerplate.lock.json`

After the first time you run `bun run update`, the CLI creates `.template/boilerplate.lock.json` at the project root. This file tracks the last upstream-template git SHA for each synced component (`.claude/skills/`, `scripts/`, `cli/`, etc.). It is safe — and recommended — to **commit this file**: your team and CI workflows need it to know which template version each component is on. Subsequent `bun run update` runs read the stored SHAs to compute precise per-file deltas, so only genuinely changed files are surfaced.

**Requirement**: `git ≥ 2.25` must be on your `$PATH` (required for sparse-checkout with `--filter=blob:none`). Run `git --version` to check; upgrade instructions are printed by the CLI if the version is too old.

---

## External CLIs (verified, not auto-installed)

The installer's step 10 (`verifyExternalClis`) runs a PATH probe — `which <binary>` on POSIX, `where <binary>` on Windows — for six command-line tools that other parts of the QA workflow depend on. This is a **presence-only** check: no version compare, no auto-install. If any are missing, the installer **prints the suggested install command and the official docs URL — but does not run anything**. System-level CLIs touch user permissions (Homebrew taps, apt, curl piped into bash, winget) and are not portable cross-platform, so auto-installing them without consent would be invasive. The user installs them manually following the docs URL.

| CLI              | Powers in this repo                                                               | Install (cross-platform)            | Official docs                                                                                         |
| ---------------- | --------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `bun`            | Runtime for every script (`bun run setup`, `bun xray`, `bun run test`)            | See official docs                   | [bun.com](https://bun.com/)                                                                           |
| `gh`             | GitHub PR / Actions workflows from `/git-flow-master`, `/regression-testing`      | See official docs                   | [github.com/cli/cli#installation](https://github.com/cli/cli#installation)                            |
| `acli`           | Jira/Confluence from terminal (`/acli`, `/sprint-testing`, `/test-documentation`) | See official docs                   | [developer.atlassian.com/cloud/acli](https://developer.atlassian.com/cloud/acli/guides/install-acli/) |
| `playwright-cli` | Agent-driven browser automation (`/playwright-cli` skill)                         | `bun add -g @playwright/cli@latest` | [playwright.dev/agent-cli](https://playwright.dev/agent-cli/introduction)                             |
| `resend`         | Email testing flows                                                               | See official docs                   | [resend.com/docs/cli](https://resend.com/docs/cli)                                                    |
| `jq`             | JSON parsing in acli Jira pipelines (advanced `acli --json \| jq …`)              | See official docs                   | [jqlang.github.io/jq/download](https://jqlang.github.io/jq/download)                                  |

> **Important — `playwright-cli` is NOT `@playwright/test`**: this is the agent-driven browser CLI from the `@playwright/cli` npm package, installed **globally**. It produces a binary literally named `playwright-cli` (not `playwright`). The `@playwright/test` library that ships as a devDependency in this repo is a separate thing — it powers the test runner (`bun run test`), not the `/playwright-cli` skill. Don't confuse them.

> **Why verify and not install?** Auto-installing system-level binaries from a project script would require asking for sudo/admin, picking a package manager per OS, and trusting that the user wants those tools in `$PATH` permanently. Verify-and-direct-to-docs is the polite alternative: you see what's missing, you read the official docs, you decide.

---

## Hand-off matrix — `/sprint-testing` vs `/sdd-*`

This is the most common point of confusion. Both workflows can drive QA work to completion. They serve different shapes of work.

| When                                                                     | Skill                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Routine in-sprint QA on a Jira ticket (most cases)                       | `/sprint-testing` (ticket-driven)                             |
| Large refactor of the test framework / KATA architecture / fixture model | `/sdd-*` (spec-driven)                                        |
| Story with detailed AC you want traced formally as a test specification  | Both: `/sdd-spec` first, then `/sprint-testing` for the cycle |

### When to reach for `/sprint-testing`

The default choice for normal sprint QA. You have a ready-for-QA Jira ticket, AC is reasonably clear, the change is bounded (one feature, one bug fix, one regression). You want the standard cycle: plan, execute trifuerza (UI/API/DB) exploration, run smoke + regression, file ATP/ATR + bug reports, transition the ticket. Nothing about the QA work requires multi-phase architectural design — a clear test plan is enough.

Example: "Test UPEX-277 — empty states on the user-list filter." Ticket is `Ready For QA`, AC is 3 bullets, scope is one component plus one API. `/sprint-testing` drives the whole thing.

### When to reach for `/sdd-*`

The right choice when the change is shaped more like a research project than a ticket. You're touching the test framework architecture (KATA layers, fixtures, Page Object structure), the design space has alternatives worth comparing, the change crosses several modules of the test suite, or there is no ticket because the work is internal QA infrastructure. SDD gives you explicit phases (explore → propose → spec → design → tasks → apply → verify → archive) and an artifact trail that survives across sessions via Engram.

Example: "Replace the auth fixture model — move from per-test login to a shared auth state file with role-based personas." This benefits from `/sdd-explore` (read the current fixture wiring), `/sdd-propose` (compare approaches), and `/sdd-design` (commit to an architecture) before any test code is rewritten.

### When to combine both

You have a QA ticket but the AC is dense and you want it traced formally as a test specification. Run `/sdd-spec` first to lock down the requirements and scenarios as a delta spec, then hand off to `/sprint-testing` for the cycle. The spec gets archived after the ticket closes, leaving a permanent trace for future regression rounds.

---

## Troubleshooting

- **gentle-ai not detected after install** — re-run `bun run setup`. The detector probes `which gentle-ai` plus `gentle-ai version`; if either fails the installer falls back to the "skip gentle-ai" branch. Confirm the binary is on PATH (`which gentle-ai` should return a path under `/usr/local/bin/`, `~/bin/`, `~/go/bin/`, or a Homebrew prefix).
- **MCPs returning 401/403** — the matching env var in `.env` is unset or wrong. `.mcp.json` (Claude) and `opencode.jsonc` are committed with `${VAR}` / `{env:VAR}` expansion; real values live in `.env`. Open `.env`, fill the var, and **restart the agent session** — env vars are read once at MCP-server spawn time. See `CLAUDE.md` Critical Rule #11.
- **MCPs not loading at all** — confirm you launched the agent via `bun run claude` / `bun run opencode` (wraps with `dotenv-cli`), or that direnv autoload is active (`direnv status` shows your `.envrc` allowed). Launching `claude` directly without either path means MCP placeholders never get expanded.
- **`direnv allow` produced `dotenv_if_exists: command not found`** — this would mean the `.envrc` is using a newer direnv feature than your version supports. The committed `.envrc` uses portable POSIX loading (works on direnv 2.21+), so if you see this, your `.envrc` has been edited locally — restore it from `git checkout .envrc`.
- **Skills not appearing in autocomplete** — restart Claude Code (or your agent of choice). MCP and skill configs are cached at agent startup.
- **`/agentic-qa-onboard` does not trigger on natural language** — use the explicit slash command: `/agentic-qa-onboard`. The natural-language triggers (`onboard me to QA`, `primer vez en QA`) are advisory, not guaranteed.
- **How do I uninstall gentle-ai skills?** — `gentle-ai uninstall` uninstalls at COMPONENT granularity, not per-skill. Use `gentle-ai uninstall --agent <agent> --components skills --yes` to remove the skills component (also accepts `engram`, `sdd`, `gga`, `persona`). `gentle-ai uninstall --all --yes` removes everything gentle-ai-managed for every supported agent. Note the asymmetry vs `install`: `uninstall` accepts `--yes`/`-y` (skip confirmation) but does NOT accept `--skill(s)`. Backups are created automatically before uninstall.

---

## How to opt out

If you prefer not to use gentle-ai, the installer accepts a "skip" choice. To make it permanent:

1. Edit `.template/installer.state.json` and set `"gentleAi": { "status": "skipped" }`.
2. Re-run `bun run setup`. The installer detects the skipped state and only configures the 7 canonical MCPs.

What you lose:

- **SDD spec-driven loop** — `/sdd-*` skills are not installed. Large test-framework refactors fall back to ad-hoc planning.
- **Persistent memory (Engram)** — no cross-session recall, no `mem_save` / `mem_search`. Each session starts blind.
- **Adversarial review (judgment-day)** — no parallel-judges review for high-stakes test framework changes. Code review reverts to single-perspective.
- **Issue creation (issue-creation)** — no issue-first enforcement helper. You file QA bugs however your team usually does.

What you keep: every workflow skill committed in this repo (`/sprint-testing`, `/test-documentation`, `/test-automation`, `/regression-testing`, `/agentic-qa-core`, `/agentic-qa-onboard`, `/playwright-cli`, `/acli`, `/xray-cli`, `/project-discovery`, `/git-flow-master`) and the 7 canonical MCPs (Context7, Tavily, Atlassian, Playwright, DBHub, OpenAPI, Postman). The repo is fully usable without gentle-ai — the integration is additive.

---

## See also

- [CLAUDE.md § Quick Start](./CLAUDE.md) — entry point for `bun run setup` and `/agentic-qa-onboard`
- [.claude/skills/agentic-qa-onboard/SKILL.md](./.claude/skills/agentic-qa-onboard/SKILL.md) — the orientation skill itself
- [docs/setup/README.md](./docs/setup/README.md) — index of setup guides in this repo
- [docs/setup/jira-setup-guide.md](./docs/setup/jira-setup-guide.md) — Jira/Atlassian credentials + acli login flow
- [docs/setup/mcp-dbhub.md](./docs/setup/mcp-dbhub.md) / [mcp-openapi.md](./docs/setup/mcp-openapi.md) — MCP-specific setup notes

---

> **You are here**: What `bun run setup` configures. **Read time**: 10 min. **Next**: `bun cli/doctor.ts` to verify, or [`README.md`](README.md) to navigate.
