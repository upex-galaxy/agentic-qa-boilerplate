# The installer — what `bun run setup` configures

> **Audience**: QA engineers cloning `agentic-qa-boilerplate` for the first time, or anyone wanting to understand what `bun run setup` configures (gentle-ai, community skills, MCPs, local skills) and what is optional.
> **Read time**: 8 minutes.
> **Status**: stable as of 2026-05-11.
>
> This document is the **contract that `cli/install.ts` implements**. The four layers of the workstation — gentle-ai (Engram + SDD), community skills via `npx skills`, locally committed workflow skills, and the 7 canonical MCPs — are documented below in that order.

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

| type | Who handles it | How |
|---|---|---|
| `credential` | **User** | AI asks the user for the value in chat (e.g. "paste your Tavily key from https://app.tavily.com"). Then AI writes it to `.env`. |
| `shell_hook` | **AI** | AI appends the `where` line to the `target` rc file with its Edit/Bash tool. Trivial. |
| `system_install` | **User** | AI shows the `where` command; the user runs it (brew/winget/apt may prompt for admin password). |
| `shell_command` | **AI** | AI runs the `target` command via Bash. |

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

| Env var | Effect |
|---|---|
| `INSTALL_SKIP_GENTLE_AI=1` | Treat gentle-ai as skipped |
| `INSTALL_SKIP_DEPS=1` | Skip `bun install` |
| `INSTALL_SKIP_PLAYWRIGHT=1` | Skip `bun run pw:install` |
| `INSTALL_SKIP_AGENTS_SETUP=1` | Skip `bun run agents:setup` |
| `INSTALL_SKIP_COMMUNITY=1` | Skip `npx skills add` step |
| `INSTALL_SKIP_JIRA=1` | Skip optional Jira bootstrap |
| `INSTALL_SKIP_API=1` | Skip optional API auth bootstrap |
| `INSTALL_SKIP_DIRENV=1` | Skip direnv detection / autoload |

---

## Launching the agent after setup

`bun run setup` finishes with two recommended ways to start an agent so MCP env vars (e.g. `TAVILY_API_KEY`, `ATLASSIAN_API_TOKEN`) get loaded from `.env`:

| Method | Platform | One-time setup | Usage |
|---|---|---|---|
| **`bun run claude` / `bun run opencode`** (default) | Windows, macOS, Linux | None — `dotenv-cli` is a project devDep | `bun run claude` from the repo root |
| **direnv autoload** (optional) | macOS, Linux, **Windows** (Git Bash recommended; PowerShell experimental, needs direnv 2.37+) | Install direnv (`brew install direnv` / `apt install direnv` / `winget install direnv`) + add hook to your shell rc, then installer runs `direnv allow` | Just `claude` or `opencode` from anywhere in the repo |

### direnv hook per shell

| Shell | Line to add | File |
|---|---|---|
| bash | `eval "$(direnv hook bash)"` | `~/.bashrc` (also works for Git Bash on Windows) |
| zsh | `eval "$(direnv hook zsh)"` | `~/.zshrc` |
| fish | `direnv hook fish \| source` | `~/.config/fish/config.fish` |
| PowerShell | `Invoke-Expression "$(direnv hook pwsh)"` | `$PROFILE` (requires direnv 2.37+, experimental) |

`.mcp.json` (Claude Code) and `opencode.jsonc` are committed with `${VAR}` / `{env:VAR}` placeholders. Real values live in `.env` (gitignored). If a server returns 401/403 at first call, the matching env var is missing — see `CLAUDE.md` Critical Rule #11 (stop, fix `.env`, restart the agent session).

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

| Slug             | Brief description                                                          |
| ---------------- | -------------------------------------------------------------------------- |
| `judgment-day`   | Adversarial parallel review — 2 independent judges review the same target  |
| `issue-creation` | Issue filing workflow (bug + feature templates, issue-first enforcement)   |

> The installer dispatches ONE batched call per agent — `gentle-ai install --agent <agent> --components engram,sdd,skills --skills <comma-separated-slug-list>`. There is no per-skill loop and no `--yes` flag (gentle-ai's `install` subcommand uses Go's stdlib `flag` package and exposes only `--agent(s)`, `--component(s)`, `--skill(s)`, `--persona`, `--preset`, `--sdd-mode`, `--dry-run`). Re-runs are safe: gentle-ai snapshots existing config files before overwriting (compressed tar.gz, deduped, last 5 retained). They DO re-apply, they don't skip.

### Why not `cognitive-doc-design` or `comment-writer`?

Both ship via gentle-ai but are dev-writing-leaning. QA reporting tone is owned vertically by `/sprint-testing` (QA comment formats, bug report structure) and `/regression-testing` (stakeholder reports). Adding the dev-writing helpers would create overlap, not value.

---

## What gets installed via `npx skills` CLI

Independent of gentle-ai, the installer also runs the official Anthropic `npx skills add` CLI to fetch community skills from upstream repos. Two lists, both defined as `const` arrays in `cli/install.ts`:

### Project-level (2 skills)

Installed into `.claude/skills/` via `npx skills add` (project mode). Not committed — `cli/install.ts` re-fetches them on every install so we always pick up upstream fixes. They are critical to the QA stack and must travel with every clone of the repo.

| Slug                        | Source                                          | Why project-level                                                                                                                       |
| --------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `playwright-cli`            | `microsoft/playwright-cli`                      | Browser automation CLI used by `/sprint-testing` and `/test-automation` as the primary `[AUTOMATION_TOOL]`.                              |
| `playwright-best-practices` | `currents-dev/playwright-best-practices-skill`  | Patterns / anti-flaky / axe-core / fixtures reference. Auto-loaded by `/test-automation` during the Code phase.                          |

### User-level (global, 7 skills)

Installed with `npx skills add <package> [--skill <name>] --global --yes` and useful across most projects regardless of stack. QA-tuned subset of the dev universal layer — design/UI skills (n8n-skills, emil-design-eng, ui-ux-pro-max) live only in the dev repo since QA does not author UI or automation flows.

| Slug                   | Source                                          | Why user-level                                                                              |
| ---------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `skill-creator`        | `anthropics/skills`                             | Author/edit skills — useful in any repo                                                     |
| `find-skills`          | `vercel-labs/skills`                            | Discover installable skills — universal                                                     |
| `gh-cli`               | `github/awesome-copilot`                        | GitHub CLI helper for CI / PRs / releases — universal                                       |
| `github-actions-docs`  | `xixu-me/skills`                                | GitHub Actions workflow reference — universal                                               |
| `brainstorming`        | `obra/superpowers`                              | Pre-implementation ideation (framework features, test design edge cases) — universal        |
| `cli-printing-press`   | `mvanhorn/cli-printing-press`                   | CLI tooling for API-as-CLI testing + framework utility scripts. Full functionality requires Go 1.26.3+; works standalone with degraded features. |
| `html-ppt`             | `lewislulu/html-ppt-skill`                      | HTML presentations for sprint planning / retro / demo decks — universal                     |

### Skipping or re-running

Run `INSTALL_SKIP_COMMUNITY=1 bun run setup` to skip the community step entirely (the previous behaviour is preserved). Re-runs are idempotent: already-installed skills are detected via `state.skills["community:<level>:<slug>"] === "installed"` in `.agents/install-state.json` and skipped silently.

If a skill fails to install (e.g., upstream repo restructured), the failure is recorded as `failed` in the state file and surfaced in the closing summary, but the installer continues — community skills are best-effort, not blocking.

---

## What stays local (committed in this repo)

Skills that are workflow-specific to this boilerplate live in `.claude/skills/` and are committed to the repo. They install with the clone — no external installer required.

| Skill                | Trigger                | Why it stays local                                                            |
| -------------------- | ---------------------- | ----------------------------------------------------------------------------- |
| `agentic-qa-core`    | `/agentic-qa-core init`| Foundation: shared references + bootstrap of `.agents/` and CLAUDE.md         |
| `agentic-qa-onboard` | `/agentic-qa-onboard`  | First-time orientation tour (this is the entry point for new contributors)    |
| `project-discovery`  | `/project-discovery`   | 4-phase reverse-engineering of a target project (Constitution → Specification)|
| `sprint-testing`     | `/sprint-testing`      | Stages 1-3: per-ticket manual QA loop (planning, execution, reporting)        |
| `test-documentation` | `/test-documentation`  | Stage 4: TMS test-case authoring + ROI prioritization (Jira/Xray bridge)      |
| `test-automation`    | `/test-automation`     | Stage 5: KATA + Playwright + TS test authoring (plan → code → review)         |
| `regression-testing` | `/regression-testing`  | Stage 6: CI suite execution, failure classification, GO/NO-GO verdict         |
| `framework-development` | `/framework-development` | Gateway for chaining `/sdd-*` skills. Use for evolving the boilerplate itself (KATA bases, fixtures, `cli/`, `scripts/`, `api/schemas/` pipeline). NOT for per-ticket QA. |
| `acli`               | `/acli`                | Atlassian CLI wrapper for Jira/Confluence terminal work                       |
| `xray-cli`           | `/xray-cli`            | Xray Cloud TMS CLI (test creation, executions, JUnit/Cucumber import)         |
| `git-flow-master`    | (auto on git intents)  | End-to-end Git operator (branch, commit, push, PR, conflict, chained-PR)      |

These skills evolve with the repo and are versioned in git. The split is intentional: gentle-ai owns the **horizontal** ecosystem (apply across all your QA repos), this repo owns the **vertical** workflow (specific to the QA stages 1-6 pipeline).

---

## Keeping the framework up to date — `.boilerplate-version.json`

After the first time you run `bun run update`, the CLI creates `.boilerplate-version.json` at the project root. This file tracks the last upstream-template git SHA for each synced component (`.claude/skills/`, `scripts/`, `cli/`, etc.). It is safe — and recommended — to **commit this file**: your team and CI workflows need it to know which template version each component is on. Subsequent `bun run update` runs read the stored SHAs to compute precise per-file deltas, so only genuinely changed files are surfaced.

**Requirement**: `git ≥ 2.25` must be on your `$PATH` (required for sparse-checkout with `--filter=blob:none`). Run `git --version` to check; upgrade instructions are printed by the CLI if the version is too old.

---

## External CLIs (verified, not auto-installed)

The installer's step 11 runs `which <binary>` for six command-line tools that other parts of the QA workflow depend on. If any are missing, the installer **prints the suggested install command and the official docs URL — but does not run anything**. System-level CLIs touch user permissions (Homebrew taps, apt, curl piped into bash, winget) and are not portable cross-platform, so auto-installing them without consent would be invasive. The user installs them manually following the docs URL.

| CLI              | Powers in this repo                                                              | Install (cross-platform)                                                                                                                  | Official docs                                                                       |
| ---------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `bun`            | Runtime for every script (`bun run setup`, `bun xray`, `bun run test`)           | macOS/Linux: `curl -fsSL https://bun.com/install \| bash`<br>Brew: `brew install oven-sh/bun/bun`<br>Windows: `irm bun.sh/install.ps1 \| iex` | [bun.sh/docs/installation](https://bun.sh/docs/installation)                        |
| `gh`             | GitHub PR / Actions workflows from `/git-flow-master`, `/regression-testing`     | macOS: `brew install gh`<br>Windows: `winget install --id GitHub.cli` or `scoop install gh`<br>Linux: apt/dnf with keyring setup (see docs) | [cli.github.com](https://cli.github.com/)                                           |
| `acli`           | Jira/Confluence from terminal (`/acli`, `/sprint-testing`, `/test-documentation`) | macOS: `brew tap atlassian/homebrew-acli && brew install acli`<br>Linux: binary download from GitHub releases                              | [developer.atlassian.com/cloud/acli](https://developer.atlassian.com/cloud/acli/guides/install-macos/) |
| `playwright-cli` | Agent-driven browser automation (`/playwright-cli` skill)                        | Global install: `bun add -g @playwright/cli@latest`<br>(or: `npm install -g @playwright/cli@latest`)<br>Binary produced: `playwright-cli`  | [playwright.dev/agent-cli](https://playwright.dev/agent-cli/introduction)           |
| `allure`         | Test reports (`bun run test:allure`)                                              | macOS: `brew install allure`<br>Windows: `scoop install allure`<br>Linux: `.deb`/`.rpm` from GitHub releases                                | [allurereport.org/docs](https://allurereport.org/docs/)                             |
| `jq`             | JSON parsing inside scripts (`scripts/sync-*`, `cli/xray/*`)                     | macOS: `brew install jq`<br>Linux: `sudo apt-get install jq` (or `dnf install jq`)<br>Windows: `winget install jqlang.jq`                  | [jqlang.github.io/jq](https://jqlang.github.io/jq/download)                         |

> **Important — `playwright-cli` is NOT `@playwright/test`**: this is the agent-driven browser CLI from the `@playwright/cli` npm package, installed **globally**. It produces a binary literally named `playwright-cli` (not `playwright`). The `@playwright/test` library that ships as a devDependency in this repo is a separate thing — it powers the test runner (`bun run test`), not the `/playwright-cli` skill. Don't confuse them.

> **Why verify and not install?** Auto-installing system-level binaries from a project script would require asking for sudo/admin, picking a package manager per OS, and trusting that the user wants those tools in `$PATH` permanently. Verify-and-direct-to-docs is the polite alternative: you see what's missing, you read the official docs, you decide.

---

## Hand-off matrix — `/sprint-testing` vs `/sdd-*`

This is the most common point of confusion. Both workflows can drive QA work to completion. They serve different shapes of work.

| When                                                                       | Skill                                                                |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Routine in-sprint QA on a Jira ticket (most cases)                         | `/sprint-testing` (ticket-driven)                                    |
| Large refactor of the test framework / KATA architecture / fixture model   | `/sdd-*` (spec-driven)                                               |
| Story with detailed AC you want traced formally as a test specification    | Both: `/sdd-spec` first, then `/sprint-testing` for the cycle        |

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

1. Edit `.agents/install-state.json` and set `"gentleAi": { "status": "skipped" }`.
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
