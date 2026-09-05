# The installer — what `bun run setup` configures

> **Audience**: QA engineers cloning `agentic-qa-boilerplate` for the first time, or anyone wanting to understand what `bun run setup` configures (gentle-ai, community skills, MCPs, local skills) and what is optional.
> **Read time**: 8 minutes.
> **Status**: updated 2026-08-23 — 5-phase TUI flow, step idempotency, GitHub repo step, three-harness selection (Claude Code / OpenCode / Codex).
>
> This document is the **contract that `cli/install.ts` implements**. The four layers of the workstation — gentle-ai (Engram only, minimal preset), community skills via `bunx skills`, locally committed workflow skills (including the vendored `judgment-day`), and the 6 canonical MCPs — are documented below in that order.

---

## 5-phase install flow

`bun run setup` runs in 5 named phases. Each phase is labelled in the terminal output. The installer is **idempotent**: every step writes a timestamp to `.template/installer.state.json` on success, and re-runs skip completed steps automatically.

### Phase 1 — DETECTION

Probes the environment before touching anything. Detects gentle-ai (version + compatibility), loads or creates `.template/installer.state.json`, and prompts for agent selection across the three supported harnesses — **Claude Code, OpenCode, Codex**. Everything detected is pre-checked; you tick off whatever you don't want configured. Exits early if none of the three is present, or if the user asks for the gentle-ai install guide.

Detection per harness:

| Harness | Counts as detected when | Selection label |
|---------|-------------------------|-----------------|
| Claude Code | `~/.claude/` exists **or** the `claude` binary is on PATH | `Claude Code (executable/config found)` |
| OpenCode | `~/.config/opencode/` exists **or** the `opencode` binary is on PATH | `OpenCode (executable/config found)` |
| Codex | the `codex` binary is on PATH **or** this repo already has `.codex/config.toml` | `Codex (CLI found; Desktop uses the same repository config)`, or `Codex Desktop target (repository configured; CLI not found)` |

Codex Desktop needs no separate entry: it consumes the same repository configuration as the CLI, so a repo that carries `.codex/config.toml` is already a valid Codex target even with no CLI installed.

### Phase 2 — INSTALLATION

Downloads and installs all software dependencies:

- `bun install` — project Node/Bun packages including `@playwright/test`
- `bun run pw:install` — Playwright browser binaries (~300 MB Chromium)
- `gentle-ai install --preset minimal` — Engram persistent memory only (one batched call per agent). SDD-* and foundation skills are NOT installed — see [What `gentle-ai install` adds](#what-gentle-ai-install-adds) below.
- `bunx skills add` — project-level skills (`playwright-cli`, `playwright-best-practices`, `resend-cli`) and user-level skills (7 cross-project utilities)

### Phase 3 — CONFIGURATION

Wires runtime configuration:

- `.env` population — discovers credential placeholders in the MCP config of every selected harness (`${VAR}` in `.mcp.json`, `{env:VAR}` in `opencode.jsonc`, `env_vars` / `bearer_token_env_var` keys in `.codex/config.toml`), then prompts for values not already set
- `direnv allow` — optional; auto-loads `.env` on `cd`
- GitHub repository — interactive `gh repo create` (optional); hydrates `state.github` from an existing remote if already wired

### Phase 4 — VERIFICATION

Validates the environment is usable:

- External CLI table — `which`-checks all 7 CLIs (`bun`, `gh`, `rg`, `acli`, `playwright-cli`, `jq`, `resend`) and prints a status table with purpose and install hint for missing entries
- State persistence — writes updated `.template/installer.state.json`

### Phase 5 — INITIAL CONFIGURATION

Interactive post-install configuration steps. Skipped automatically when no TTY is detected (CI / non-interactive mode):

- `agents:setup` — populates `.agents/project.yaml` with project identity, Jira URL, environments
- `acli` auth probe — collects `ATLASSIAN_EMAIL` / `ATLASSIAN_API_TOKEN` into `.env` and the site host into `.agents/project.yaml` if missing, then runs `acli jira auth login` (stdin-piped token, `--site` from `bun run jira:url --slug`)
- **Jira catalogs sync (Step 13)** — one prompt picks the catalog source for the whole project, then syncs custom fields + workflow statuses/transitions accordingly:
  - **My own Jira workspace** — runs the Jira auth loop (up to 5 attempts), then `jira:sync-fields --force` + `jira:sync-workflows --force`. **Requires Jira `Administer` permission** (global or project-scoped); without it the scripts exit 0 and the step records `state.postInstall.jiraSync* = "skipped-no-admin"`.
  - **UPEX-Galaxy standard** — `jira:sync-fields --upex --force` + `jira:sync-workflows --upex --force` + `jira:sync-link-types --upex`, downloading the reference catalogs from `upex-galaxy/agentic-qa-boilerplate@main` (no admin, no Jira API — just GitHub raw).
  - **Skip for now** — leaves the catalogs unconfigured.

  Whatever the choice (including a no-admin skip or a cancelled prompt), the installer then writes an empty `{}` placeholder for any of `.agents/jira-fields.json` / `jira-workflows.json` / `jira-link-types.json` still missing on disk. This guarantees the SKILL.md-referenced paths exist, so the `lint-skills` STALE-PATH check never fails `repo:check` / the pre-push hook on a freshly bootstrapped project. The `{}` form is treated as "unpopulated", so a later `bun run jira:sync-*` fills it without `--force`.
- `jira:check` — validates `.agents/jira-required.yaml` against the workspace. Skipped when the sync was no-admin / skipped (the comparison would be against the UPEX catalog or empty placeholders, not the user's workspace).

The installer aborts hard if the `acli` binary is missing — install it from <https://developer.atlassian.com/cloud/acli/guides/install-acli/> and re-run. Set `INSTALL_SKIP_JIRA=1` to bypass the acli requirement and Jira sync steps (use only for non-Jira projects).

> **Link types**: `jira:sync-link-types` is auto-invoked only when you pick the **UPEX-Galaxy standard** source above (it downloads `.agents/jira-link-types.json --upex`). For the **own-workspace** source, refresh it by hand: `bun run jira:sync-link-types` (or `--upex` for the UPEX standard). USER-OK (no admin needed for either path).

Each step in Phase 5 records its completion in `state.postInstall` so re-runs skip it on the next `bun run setup`.

### Phase 5b — GIT STRATEGY SETUP (agent-driven, mandatory before your first push)

The scaffold ships a **default** git strategy (`solo-main`) with `strategy_source: inherited` in `.agents/project.yaml` — a placeholder nobody chose for YOUR project. Defining it is an explicit step, not an inherited fact: once your project identity is filled in, ask your AI agent:

> **"set up our git strategy"**

That runs git-flow-master's Strategy Setup: it resolves your branching flow (solo-main / main-integration / sdet / others), asks the merge + hotfix + protection-policy questions, materializes any long-lived branches, and writes the `git_strategy:` block with `strategy_source: chosen`. Until you do this, the agent will offer it on your first git intent, and the synced `pre-push` hook (`bun run git:policy verify`) fails with a message pointing you here — that failure is the signal that this setup is pending, not a bug.

---

## Idempotency — re-running setup safely

Every step writes an ISO timestamp to `state.steps[<key>]` in `.template/installer.state.json`. A re-run skips a step when its timestamp is present.

### Force flags

| Method                        | Effect                                              |
| ----------------------------- | --------------------------------------------------- |
| `--force` CLI flag            | Clear all step timestamps — re-run everything       |
| `--force-step <key>`          | Clear one step (e.g. `--force-step 5-deps-install`) |
| `INSTALL_FORCE_ALL=1`         | Same as `--force`                                   |
| `INSTALL_FORCE_<UPPER_KEY>=1` | Same as `--force-step` (dashes become underscores)  |

Step keys that participate in idempotency (each writes an ISO timestamp on success): `5-deps-install`, `6-playwright`, `8-skills-gentle-ai`, `9-skills-community-project`, `9-skills-community-global`, `12-api-bootstrap`, `13-github-repo`. Phase 1 detection steps (`1-repo-verify`, `2-gentle-ai-detect`, `3-gentle-ai-install`, `4-agent-detect`) and Phase 4 verification/persistence (`10-mcp-env`, `11-verify-clis`, `14-state-write`) always re-run since they probe live state. Phase 5 post-install steps (`agents:setup`, `acli:auth`, `jira:sync-fields`, `jira:sync-workflows`, `jira:check`) track status under `state.postInstall.*` rather than `state.steps`.

---

## Before you run setup — prerequisites

The installer is self-diagnosing: every stage prints the exact install URL or command when it detects something missing. But you will iterate faster if you front-load the hard blockers below. For the same checklist with brief tables, see the top of [`README.md`](./README.md#prerequisites).

### Hard blockers — installer exits 1 if missing

| Tool                                                                               | Min version | Enforced at                                 | Message you see on failure                                                                      |
| ---------------------------------------------------------------------------------- | ----------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Bun**                                                                            | `>= 1.0.0`  | `bun run setup:doctor --preflight` (Step 0) | `✗ Preflight failed · Bun X.Y.Z is too old (need >= 1.0.0) · Fix: bun upgrade`                  |
| **`node` (the real binary)**                                                       | `>= 18`     | Scaffolder doctor (`packages/…/doctor.ts`)  | `node >= 18 · not found on PATH — install node >= 18: https://nodejs.org`                       |
| **`node_modules/@inquirer/prompts`** (proxy for `bun install`)                     | —           | Preflight (Step 0)                          | `✗ Preflight failed · Missing node_modules/@inquirer/prompts · Fix: bun install`                |
| **Agent** — Claude Code (`~/.claude/`), OpenCode (`~/.config/opencode/`) **or** Codex (`codex` on PATH, or `.codex/config.toml` in the repo) | latest      | Step 4 (agent selection)                    | `✗ No agent executable or Codex repository configuration detected.` followed by all three docs URLs |
| `git`                                                                              | any         | Scaffolder (`runners.ts:23`) + Husky hooks  | `ENVIRONMENT · git is required but not found on PATH. · Install: https://git-scm.com/downloads` |
| `tar`                                                                              | any         | Scaffolder (`download.ts`)                  | `ENVIRONMENT · \`tar\` not found on PATH.`                                                      |

The agent check is the gotcha that bites first-timers most often: a missing `gh` or `acli` just yields a warning later, but zero detected agents hard-stops Step 4. Install at least one of Claude Code, OpenCode, or Codex first, then run `bun run setup`.

### Windows

PowerShell and cmd are supported directly — WSL and Git Bash work too, but neither is required. Two Windows-specific notes:

- **Install Bun with `powershell -c "irm bun.sh/install.ps1 | iex"`**, not `npm i -g bun`. The npm route writes only a `bun.cmd` shim (no `bun.exe`), which the scaffolder has to launch through `cmd.exe`.
- **`tar` needs no extra install.** Windows 10 1803+ and Windows 11 ship bsdtar at `C:\Windows\System32\tar.exe`, and the scaffolder builds a tar command line that both bsdtar and GNU tar accept.

Under WSL, keep the project on the Linux filesystem (`~/projects/...`). On a `/mnt/c` path Bun cannot create its bin shims and `bun install` fails with `could not open bin metadata file`.

### Quasi-required — installer warns and offers install commands

| Tool          | Min version | Enforced at                   | What happens on miss                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------- | ----------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **gentle-ai** | `>= 1.26.5` | `install.ts:500-545` (Step 2) | Prints `gentle-ai not detected on PATH.` then offers two paths: (a) show install commands (`brew install gentle-ai` on macOS, `go install github.com/Gentleman-Programming/gentle-ai/cmd/gentle-ai@latest` on Linux) and exit, or (b) continue without gentle-ai. Older-than-min version triggers `gentle-ai X.Y.Z is older than required 1.26.5. Upgrade with: gentle-ai update` and the setup continues with the warning. |

If you skip gentle-ai, Engram persistent memory is NOT installed (no cross-session memory). The locally committed QA workflow skills (`/shift-left-testing`, `/sprint-testing`, `/test-automation`, `/test-documentation`, `/regression-testing`, `/agentic-qa-core`, vendored `/judgment-day`) keep working, and the 6 canonical MCPs are still configured.

### Per-skill CLIs — lazy-required, non-blocking at setup

These CLIs are **not optional** for the workflow — each one is consumed by a specific skill (`gh` for `/git-flow-master` + `/regression-testing`, `acli` for `/acli` + `/shift-left-testing` + `/sprint-testing` + `/test-documentation`, `playwright-cli` for `/playwright-cli`, `resend` for `/resend-cli`, `jq` for `acli ... --json | jq ...` pipelines). The installer cannot guess which skills you will run, so it ships them as **lazy-required**: a missing binary surfaces as a warning during Step 10 but never blocks setup. Install them up front if you plan to use the whole stack, or on-demand when the owning skill surfaces a missing-binary error.

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
| `direnv` | Auto-loads `.env` on `cd` so the bare `claude` / `opencode` / `codex` binaries see MCP credentials. Without it, the `bun run claude` / `bun run opencode` / `bun run codex` wrappers (powered by `dotenv-cli`, already a project devDep) do the same thing cross-platform. | `cli/doctor.ts` (`detectDirenv`) reports `direnv.installed`, `version`, `envrc_allowed`, `hook_in_rc`. The installer offers `direnv allow` + a shell-hook nudge. **Windows users**: skip — PowerShell support is experimental (direnv 2.37+); Git Bash works but the wrapper is simpler. The installer offers the prompt anyway; decline freely. |

### MCP credentials — 7 env vars filled into `.env`

`cli/lib/variables-manifest.ts` declares the `VAR_MANIFEST` that `cli/doctor.ts` reads (via `varsFor('local')`) — the vars consumed by the 6 canonical MCPs plus the ATLASSIAN_* family used by acli + scripts/sync-jira-*.ts. Missing keys do not block setup, but every `bun run setup:doctor` will list them under `pending_actions` with the canonical `where` URL (token-generation page) until they are filled.

```
TAVILY_API_KEY                                  → https://app.tavily.com/ → API keys
ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN → https://id.atlassian.com/manage-profile/security/api-tokens
(the site host is not a .env var — set it with `bun run agents:setup`)
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

Most users today ask an AI (Claude Code, OpenCode, Codex, …) to drive the setup instead of running it by hand. The installer is built for both flows; the AI path uses a few specific entry points:

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
INSTALL_AGENTS=claude-code,opencode,codex \
  TAVILY_API_KEY=tvly-... \
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

| Flag / Env var                 | Effect                                        |
| ------------------------------ | --------------------------------------------- |
| `--force`                      | Clear all step timestamps — re-run everything |
| `--force-step <key>`           | Re-run one step by key                        |
| `INSTALL_FORCE_ALL=1`          | Same as `--force`                             |
| `INSTALL_FORCE_GENTLE_AI=1`    | Re-run gentle-ai skill install                |
| `INSTALL_FORCE_COMMUNITY=1`    | Re-run community skill install                |
| `INSTALL_FORCE_GITHUB=1`       | Re-run GitHub remote setup                    |
| `INSTALL_FORCE_AGENTS_SETUP=1` | Re-run agents:setup                           |

---

## Launching the agent after setup

`bun run setup` finishes with two recommended ways to start an agent so MCP env vars (e.g. `TAVILY_API_KEY`, `ATLASSIAN_API_TOKEN`) get loaded from `.env`:

| Method                                              | Platform                                                                                      | One-time setup                                                                                                                                          | Usage                                                 |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **`bun run claude` / `bun run opencode` / `bun run codex`** (default) | Windows, macOS, Linux                                                                         | None — `dotenv-cli` is a project devDep                                                                                                                 | `bun run claude` from the repo root                   |
| **direnv autoload** (optional)                      | macOS, Linux, **Windows** (Git Bash recommended; PowerShell experimental, needs direnv 2.37+) | Install direnv (`brew install direnv` / `apt install direnv` / `winget install direnv`) + add hook to your shell rc, then installer runs `direnv allow` | Just `claude`, `opencode` or `codex` from anywhere in the repo |

### direnv hook per shell

| Shell      | Line to add                               | File                                             |
| ---------- | ----------------------------------------- | ------------------------------------------------ |
| bash       | `eval "$(direnv hook bash)"`              | `~/.bashrc` (also works for Git Bash on Windows) |
| zsh        | `eval "$(direnv hook zsh)"`               | `~/.zshrc`                                       |
| fish       | `direnv hook fish \| source`              | `~/.config/fish/config.fish`                     |
| PowerShell | `Invoke-Expression "$(direnv hook pwsh)"` | `$PROFILE` (requires direnv 2.37+, experimental) |

All three MCP configs are committed with credential placeholders — `${VAR}` in `.mcp.json` (Claude Code), `{env:VAR}` in `opencode.jsonc`, `env_vars` / `bearer_token_env_var` keys in `.codex/config.toml`. Real values live in `.env` (gitignored). If a server returns 401/403 at first call, the matching env var is missing — see `AGENTS.md` Critical Rule #10 (stop, fix `.env`, restart the agent session).

Each `bun run` wrapper is `dotenv -o -e .env -- <binary>`. The `-o` matters: it forces `.env` to win over an inherited process variable. Launching the bare executable skips that, and a stale inherited value can silently shadow the file.

### Optional cosmetic polish

Pure UX, zero behavioral change. Skip without consequence.

| Agent           | Tool                                                        | How                                                                                                                                                                                                                                                                                             |
| --------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude Code** | [`ccstatusline`](https://github.com/sirmalloc/ccstatusline) | `bunx -y ccstatusline@latest` — interactive TUI to customize the Claude Code status line (model, tokens, context %, git branch, etc.). **Run in a plain terminal with no active agent session**; the configurator owns the terminal while it runs and will collide with a live Claude Code TUI. |
| **OpenCode**    | `opencode-subagent-statusline` plugin                       | Already enabled in `opencode.jsonc` (`"plugin": [..., "opencode-subagent-statusline"]`). Shows the active subagent in the OpenCode status line. Nothing to install — `bun run opencode` picks it up.                                                                                            |

### Optional UX upgrades

Two community tools change how the agent talks and how the terminal looks. Both are recommended but **never auto-installed** — they are user-level scope and modify environments outside this repo.

#### caveman — token compression skill

A user-level skill that compresses agent output by ~65-75% by talking like caveman: drop articles, fillers, and pleasantries; keep technical substance exact. Code, commits, PRs, and security warnings always render in normal English (built-in boundary).

- Levels: `lite` | `full` (this repo's default) | `ultra` | `wenyan`
- Reverse triggers (any of these returns the agent to verbose mode): `normal mode`, `habla normal`, `stop caveman`, `speak normally`, `be verbose`, `más detallado`
- Requires Node >= 18

Install with `--no-hooks`:

- macOS / Linux: `curl -fsSL https://raw.githubusercontent.com/JuliusBrussee/caveman/main/install.sh | bash -s -- --no-hooks`
- Windows: `npx -y github:JuliusBrussee/caveman --no-hooks`

> **Why `--no-hooks`.** The installer defaults to `--all`, which installs the Claude Code plugin **and** writes a second copy of the same two hooks into `~/.claude/settings.json`. Both copies then fire on every turn, so caveman is injected twice per prompt for no benefit. `--no-hooks` keeps the plugin (which registers those hooks itself, in its own `plugin.json`), the multi-agent coverage that matters here because this repo also runs on OpenCode, and the `caveman-shrink` MCP proxy. It only skips the duplicate registration.
>
> Already installed without the flag? Delete the `hooks` block from `~/.claude/settings.json`. Nothing else needs to change, and no files are removed: the scripts under `~/.claude/hooks/` simply stop being registered.
>
> On Windows the one-liner cannot take flags (`irm | iex` gets no arguments, see caveman issue #565), so the command above calls the same Node installer the script would have delegated to.

Docs: https://github.com/JuliusBrussee/caveman

#### ccstatusline — Claude Code statusline TUI

Configure the bottom statusline of Claude Code (model name, token usage, git branch, usage stats, etc.). Cosmetic only — no impact on agent behavior.

> **WARNING**: run `ccstatusline` in a SEPARATE terminal with NO agent session active. Concurrent TUIs fight over stdin and break the agent prompt.

Install + configure: `bunx -y ccstatusline@latest`

Docs: https://github.com/sirmalloc/ccstatusline

---

## What is gentle-ai and why this repo uses it

[gentle-ai](https://github.com/Gentleman-Programming/gentle-ai) is a user-level installer that configures AI agents (Claude Code, OpenCode, Cursor, etc.) with curated skills, an MCP-based persistent memory layer (Engram), and an optional SDD (Spec-Driven Development) orchestrator. It does not install agents themselves — it tunes the agents you already have.

This repo uses gentle-ai exclusively for **Engram persistent memory**. We invoke `gentle-ai install --preset minimal`, which installs ONLY the `engram` component (binary + MCP adapter + agent frontmatter wiring). No SDD-* skills, no foundation skills.

**Rationale**: this is a QA repo. Our workflow skills (`/sprint-testing`, `/test-automation`, `/test-documentation`, `/regression-testing`) already cover Plan → Code → Verify natively. SDD ceremony was designed for software-design workflows (specs, archives, strict TDD) that don't apply to authoring E2E/API tests. Adding them at install time would create overlap and confusion. Adversarial review is covered by the vendored `judgment-day` skill committed under `.agents/skills/judgment-day/` — no upstream dependency.

The integration is **not strict**. If you choose to skip gentle-ai, the repo still works: workflow skills committed locally keep functioning, and the 6 canonical MCPs are still configured. What you lose is persistent cross-session memory (engram).

---

## What `gentle-ai install` adds

`bun run setup` dispatches one batched call per agent:

```bash
gentle-ai install --agent <agent> --preset minimal
```

This installs:

| Slug     | Type      | What it does                                                                                                |
| -------- | --------- | ----------------------------------------------------------------------------------------------------------- |
| `engram` | Component | Persistent memory across sessions. Auto-saves decisions, bugs, conventions; auto-recalls on session resume. |

That's it for the minimal preset. No SDD-* skills, no `skill-registry`, no `judgment-day` (we use the vendored copy), no `issue-creation`, no `cognitive-doc-design`, no `comment-writer`.

### Re-run safety

Re-runs are safe: gentle-ai snapshots existing config files before overwriting (compressed tar.gz, deduped, last 5 retained). They DO re-apply, they don't skip. There is no `--yes` flag (gentle-ai's `install` subcommand uses Go's stdlib `flag` package and exposes only `--agent(s)`, `--component(s)`, `--skill(s)`, `--persona`, `--preset`, `--sdd-mode`, `--dry-run`). Internal prompts auto-default when stdin is not a TTY.

### Want the SDD suite? Install manually

The minimal preset is sufficient for every shipped workflow skill — `/framework-development` included. Install SDD manually only if you want the explicit SDD ceremony (explore → propose → spec → design → tasks → apply → verify → archive) for an architectural change of your own:

```bash
gentle-ai install --agent <agent> --components engram,sdd
```

This adds 10 SDD skills (`sdd-init/explore/propose/spec/design/tasks/apply/verify/archive/onboard`) + the `_shared/` runtime + 9 slash commands + the SDD orchestrator injection. Restart your agent after install so the new skills appear in the system-reminder list.

---

## What gets installed via `bunx skills` CLI

Independent of gentle-ai, the installer also runs the official Anthropic `bunx skills add` CLI to fetch community skills from upstream repos. Two lists, both defined as `const` arrays in `cli/install.ts`:

### Project-level (3 skills)

Installed into `.agents/skills/` via `bunx skills add` (project mode) — the same canonical store as the committed skills, so all three harnesses see them without a second copy. Not committed — `cli/install.ts` re-fetches them on every install so we always pick up upstream fixes. They are critical to the QA stack and must travel with every clone of the repo.

| Slug                        | Source                                         | Why project-level                                                                                                                                      |
| --------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `playwright-cli`            | `microsoft/playwright-cli`                     | Browser automation CLI used by `/sprint-testing` and `/test-automation` as the primary `[AUTOMATION_TOOL]`.                                            |
| `playwright-best-practices` | `currents-dev/playwright-best-practices-skill` | Patterns / anti-flaky / axe-core / fixtures reference. Auto-loaded by `/test-automation` during the Code phase.                                        |
| `resend-cli`                | `resend/resend-skills`                         | Resend email testing CLI. Pairs with the `resend` external binary verified in step 11. Project-level because email provider choice varies per project. |

### User-level (global, 7 skills)

Installed with `bunx skills add <package> [--skill <name>] --global --yes` and useful across most projects regardless of stack.

| Slug                  | Source                     | Why user-level                                                                       |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------------ |
| `skill-creator`       | `anthropics/skills`        | Author/edit skills — useful in any repo                                              |
| `find-skills`         | `vercel-labs/skills`       | Discover installable skills — universal                                              |
| `github-actions-docs` | `xixu-me/skills`           | GitHub Actions workflow reference — universal                                        |
| `brainstorming`       | `obra/superpowers`         | Pre-implementation ideation (framework features, test design edge cases) — universal |
| `html-ppt`            | `lewislulu/html-ppt-skill` | HTML presentations for sprint planning / retro / demo decks — universal              |
| `bun`                 | `bun.sh/docs`              | Bun runtime reference — universal across every project that uses bun                 |
| `mkd`                 | `upex-galaxy/agentic-user-skills` | Make Decision: decision-deck browser UI the AI drives via a spec JSON (justified options, recommended pick, copy-JSON contract) — universal |

### Skipping or re-running

Run `INSTALL_SKIP_COMMUNITY=1 bun run setup` to skip the community step entirely (the previous behaviour is preserved). Re-runs are idempotent: already-installed skills are detected via `state.skills["community:<level>:<slug>"] === "installed"` in `.template/installer.state.json` and skipped silently.

If a skill fails to install (e.g., upstream repo restructured), the failure is recorded as `failed` in the state file and surfaced in the closing summary, but the installer continues — community skills are best-effort, not blocking.

---

## Multi-harness layout: one source, three consumers

The installer configures whichever of **Claude Code, OpenCode, and Codex** you selected in Phase 1, but it never duplicates content to do it. There is exactly one copy of every instruction and every skill; where the harnesses genuinely differ (MCP file format, hook API, whether slash commands exist at all) each keeps a thin versioned adapter.

| Surface | Claude Code | OpenCode | Codex CLI + Desktop |
|---------|-------------|----------|---------------------|
| **Instructions** | `CLAUDE.md` → `@AGENTS.md` **[generated shim]** | `AGENTS.md` (native) | `AGENTS.md` (native) |
| **Skills** | `.claude/skills` **[generated alias]** | `.agents/skills/` (native) | `.agents/skills/` (native) |
| **Commands** | `.claude/commands/*.md` **[generated]** | `.opencode/commands/*.md` **[generated]** | none: invoke the skill directly |
| **Hook** | `.claude/settings.json` → `UserPromptSubmit` | `.opencode/plugins/personality-reinject.js` | `.codex/hooks.json` → `UserPromptSubmit` |
| **MCP** | `.mcp.json` | `opencode.jsonc` | `.codex/config.toml` |

- **Instructions.** `AGENTS.md` is the only instruction body. OpenCode and Codex load it natively; Claude Code loads `CLAUDE.md`, which is exactly `@AGENTS.md` plus one newline. A documented import rather than a symlink, so it survives a Windows checkout.
- **Skills.** All 19 committed skills live in `.agents/skills/`, and the community project-level skills install into the same store. Claude Code reaches that tree through `.claude/skills`, a POSIX symlink (Windows junction) that is generated and gitignored: never committed, never hand-edited.
- **Commands.** The 10 slash commands carry no workflow body. Both wrapper sets are 7-line files generated from `.agents/compatibility/command-aliases.json`; each names a target skill plus a mode and forwards `$ARGUMENTS`. Codex skips the wrapper layer and invokes the skill directly.
- **Hook.** `.agents/hooks/personality-reinject.mjs` holds the contract text once. Claude and Codex run it as a command hook; OpenCode imports the constant from a thin plugin.
- **MCP.** The canonical server set is whatever `.mcp.json` declares (`context7`, `tavily`, `playwright`, `dbhub`, `openapi`, `postman` out of the box); every server there must exist in the other two configs. Parity is checked semantically: each native format is normalized before comparison and matched on the `.env` variables each server depends on and on its literal settings, so a server missing from one host, or present in one host only, is a failure. The six boilerplate-known ids additionally get a strict per-host shape check when the project declares them; any other server gets the generic check only, so a downstream project may add or drop servers freely. Codex cannot expand `${VAR}`, so `.codex/config.toml` names every secret by variable (`bearer_token_env_var`, `env_vars`). `docs/mcp/*.template.*` stay as opt-in templates for hosts without a runtime adapter (Gemini CLI, Cursor).

### Regenerating and verifying

Bold `[generated]` cells above are output. Edit the source, then regenerate:

| Generated artifact | Its source | Regenerate |
|--------------------|------------|------------|
| `CLAUDE.md` (one-line `@AGENTS.md` shim) | `AGENTS.md` | `bun run agents:compat` |
| `.claude/skills` (POSIX symlink / Windows junction) | `.agents/skills/` | `bun run agents:compat` |
| One Claude + one OpenCode wrapper per alias (10 upstream, plus any project-declared) | `.agents/compatibility/command-aliases.json`, overlaid by the optional `command-aliases.project.json` | `bun run agents:compat` |

A project that needs its own slash commands declares them in `.agents/compatibility/command-aliases.project.json` (same schema as the upstream manifest; optional; bootstrap-only, so `bun run up` never overwrites it). The engine reads the upstream aliases first, then the overlay: same `alias` replaces, new `alias` adds, `wrapperHosts` always come from upstream. A wrapper file that neither manifest produced is reported by name (`Command wrapper not declared in any manifest: <path>; add it to .agents/compatibility/command-aliases.project.json or delete it`) and never deleted by the repair.

You rarely run either command by hand. `bun run setup` and `bun run up` both call the same repair internally (`repairRepositoryCompatibility` in `cli/install.ts`, and `repairAgentSurfaces` from the compatibility hook in `cli/update-boilerplate.ts`): they create or fix the alias, rewrite any stale wrapper, and then re-verify, so a clean install and a routine update both leave the contract satisfied without a manual step.

`bun run agents:compat:check` validates the whole contract: shim bytes, alias target, both wrapper sets byte-for-byte against the merged manifest, hook adapters, MCP parity. It runs inside `bun run repo:check`, in the pre-push hook, and conditionally in pre-commit. A wrapper that grew a body fails as `contains workflow prose`. The alias status line is printed on every run (created, OK, deferred until the migration commit, missing) and the errors are grouped per surface (instructions, alias, wrappers, hooks, MCP). `bun run setup:doctor` reports the same surfaces (wrapper and server counts derived from the merged manifest and `.mcp.json`, `errors_by_surface` and `alias` in `--json`) plus **Codex repository trust**, which is runtime state no file read can verify: project `.codex/` config and hooks load only in a repository you have marked trusted.

### Updating a project created before the multi-harness move

A project scaffolded when instructions lived in `CLAUDE.md` and skills in `.claude/skills/` gets a one-time migration the first time it runs `bun run up`. It happens **before** any component is synced, because the sync alone would be destructive: `CLAUDE.md` is a generated file whose upstream copy is now the one-line shim, and `AGENTS.md` is on the never-synced watchlist, so a plain sync would replace the project's AI memory with a pointer to a file that does not exist.

The migration moves the project's memory from `CLAUDE.md` to `AGENTS.md` and leaves `CLAUDE.md` as the shim; moves every skill under `.claude/skills/` into `.agents/skills/`, project-authored ones included; and archives (never overwrites) any legacy skill whose name the canonical store already owns. Nothing is deleted: what is not moved is preserved under `.template/pre-agents-migration/` (gitignored). The pass is idempotent, and if a single item cannot be resolved without guessing it refuses in full, before touching anything, rather than applying halfway.

After that one update, the project works in Claude Code, OpenCode and Codex from the same source. See [**Una fuente, tres harnesses**](https://upex-galaxy.github.io/agentic-qa-boilerplate/harnesses.es.html) for the full picture.

### What every `bun run up` reports

The run ends with a single "Estado por superficie" table: one row each for Instrucciones y config, Skills, Comandos, Hooks, MCP, Env, Componentes, package.json, Git and Verificación (10 rows), with an ok or warn glyph. Below it comes ONE parity prompt, printed and saved to `.agents/prompts/parity-plan.md` (gitignored, single-use; `--dry-run` prints it and does not save it). Each row of the prompt names a surface, a file and concrete evidence: headings added, removed or changed in a watched file plus hunk counts, a server declared in `.mcp.json` but missing from a host, a wrapper file no manifest produced, a skill archived under `.template/pre-agents-migration/` because of a name collision, a component held back, an env key that drifted. The prompt tells the AI to present that table and WAIT for a decision per row (`keep project | take upstream | merge`) before editing, then apply only the chosen rows and run tests, types and lint.

Two flags and one watchlist shape that report. `--strict` exits 1 when the run ends with a blocking parity finding (a broken compat contract: alias, wrappers, hooks, MCP), for CI; without it the run warns and exits 0, and drift on a protected file never blocks. `.claude/settings.json`, `.codex/` and the husky hooks are delivered once when the project lacks them (bootstrap-only) and otherwise sit on the protected watchlist next to `AGENTS.md`, `.mcp.json`, `opencode.jsonc`, `.codex/config.toml`, `allurerc.mjs`, `playwright.config.ts`, the KATA bases and the CI workflows: the updater never overwrites them, so project permissions, servers and hook edits survive, and any drift from upstream appears as a prompt row (a stale hook command is still caught by `agents:compat:check`). Every row is one path: a stray wrapper is a single `add to overlay` row, and a watched file that also breaks a compat contract is one blocking row with both pieces of evidence. A run that applies nothing leaves the tree byte-identical (`git status` clean, the lock untouched). An aborted run, whatever the cause (dirty tree, corrupt lock, failed clone, declined migration or self-update), ends with `Abortado.` and exit 1 rather than a success line.

One more thing on the migration run itself: the `.claude/skills` alias is NOT created in that invocation. The migration unindexes the committed `.claude/skills/*` tree, and git refuses to rewrite index entries behind a symlink, so an alias created right away would break `lint-staged` on the very commit that records the migration. The run prints the next step and repeats it in the closing box: commit the migration, then `bun run agents:compat` creates the alias. The compat check treats the missing alias as expected while that commit is pending (a re-run before it keeps deferring); every other contract is still enforced.

### What updater 8.2 adds

`CLI_VERSION` 7.0 -> 8.2 in one jump, so the changes the dev boilerplate shipped in two live-run cycles land here together:

- **Never a destructive default.** `take upstream` is suggested only where the project lacks the content entirely. A row naming project-only servers, keys, headings or edits suggests `merge`; an `opencode.jsonc` holding project servers reads "only here: ... declare them in `.mcp.json` and `.codex/config.toml`, or remove them", still blocking, never "take upstream". Every `merge` on a watched file says what to port and what to keep (`port upstream additions only: <keys>; keep project-only key(s): <keys>`; `keep project` when only the project has extra keys; `take upstream` only when upstream added keys and nothing else differs).
- **`--dry-run` previews with the new updater.** When upstream carries a newer `cli/`, the preview does not write it: the fetched updater runs from the upstream clone against the project (same flags, same cwd) and shows its migration plan, component preview and parity table. Nothing is written and the prompt is not saved. Without a terminal on stdin and no `--auto` / `--interactive`, the run assumes `--auto` and prints one notice instead of hanging.
- **Post-sync gates.** After the apply, the project's `types:check`, `lint:check` and `kata:manifest:check` run (120 s each; a gate that does not finish is skipped with a note; a script that does not exist is skipped; `--no-gates` disables them). A failure becomes a "Verificación" row with the exit code, the first error lines and which of the failing files this run applied, plus a `Gates:` line in the closing box. Informational only: never an abort, never blocking under `--strict`.
- **`package.json` rows and overwritten edits.** Every key kept at the project's value while upstream differs is one `package.json` row, with both values in the saved file. A synced file the project had edited (3-way against the lock cursor) and the run overwrote gets a `merge` row naming its `.backups/` copy and the hunk count.
- **Re-run safety.** The run records what it wrote in `.template/last-apply.json` (gitignored, sha256 per path). The next dirty-tree guard exempts a recorded path whose hash still matches, so `bun run up --auto` twice in a row, without committing in between, proceeds as a no-op. An unrelated dirty synced path, or a synced file edited by hand since, still aborts, naming `Commit sugerido` and the prompt path.
- **Converging rows for project-customized synced files.** `.husky/pre-commit` and `.husky/pre-push` are on the protected watchlist (project gates live there): delivered once when missing, never overwritten, one drift row per upstream change with the hunks as evidence. The rest of `.husky/` (the `_/` helpers) keeps syncing.
- **`updater.protected_paths`.** A project lists any other synced file it merged by hand under `updater:` in `.agents/project.yaml` (repo-relative file paths, empty by default, documented in `.agents/README.md`). Listed paths join the watchlist at runtime with the same semantics. A path outside the repo, under `.git`, a directory or a non-string is reported at the start of the run and ignored. The row for an overwritten project edit ends with `add the path to updater.protected_paths in .agents/project.yaml so the next sync keeps your merge`, and the saved prompt repeats it under the row as the YAML to paste.
- **Identity files compare structure only.** `.agents/project.yaml` and `.agents/jira-required.yaml` (bootstrap-only, project-owned) fire an `informational` row listing the keys upstream added, and no row at all when only values differ.
- **Host-agnostic `cli/**`.** `cli/updater-host-types.test.ts` compiles `cli/**` with a required `NODE_ENV` on `ProcessEnv` on every `bun test`, so the synced tests never break under a host that augments `ProcessEnv`.
- **`UPEX_TEMPLATE_REPO`.** Points the updater at a fork (`OWNER/REPO`, via `gh`) or a local clone (absolute path or `file://`, via `git`, no `gh` session), which is how an unpublished branch is tested against a consumer.

### What updater 8.4 adds

`CLI_VERSION` 8.3 -> 8.4, ported from the dev boilerplate. Five polish items.

- **Self-update cursor unstuck from a 7.x parent.** A project's first self-update from a 7.x parent predates `UPEX_UPDATER_SELF_UPDATED`: that code re-execs the child on `UPEX_UPDATER_REEXEC=1` alone, with no signal that `cli/` was just written at upstream HEAD, so the lock cursor for that component never advanced. The re-exec child now checks for itself: it compares every file the self-update component owns against upstream by blob SHA and settles the cursor there when they all match, same effect as the env signal.
- **Punctuation-insensitive heading comparison.** The parity report's markdown heading diff now normalizes separators before comparing: `## Setup — Config` and `## Setup: Config` read as the same heading instead of firing a spurious added/removed pair. Whitespace is collapsed too, so a stray double space never causes a false mismatch.
- **Skills registry regenerated after parity.** `REGISTRY.md` now rebuilds after the parity hook runs, not before, so it reflects `.agents/skills/` as every hook left it, parity included. A skill row reporting a project edit overwritten now ends with `run bun run skills:registry`, since the registry the sync just wrote was built from the upstream content the overwrite applied, not the project's edit. The KATA manifest hook keeps its own place ahead of the gates.
- **Silently seeded watched files.** A watched file with no marker yet, whose upstream copy provably has not changed since the project's own lock cursor, is seeded silently too now, same treatment as a freshly declared `updater.protected_paths` path but for a different reason: first-run noise on a migrated repo, or a project running per-file marker tracking for the first time, not a new upstream change to review.
- **`Gates: omitidas (...)` line.** A run that skips the gates entirely (`--no-gates`, or nothing applied) now says so in the closing box instead of dropping the `Gates:` line: `Gates: omitidas (--no-gates)` or `Gates: omitidas (sin cambios)`.

### What updater 8.3 adds

`CLI_VERSION` 8.2 -> 8.3, ported from the dev boilerplate. Two of the six items were born in this repo's 8.2 port and came back upstream; the other four are polish from two more live runs.

- **Guard scope.** The dirty-tree guard blocks only on uncommitted work the sync would overwrite: a synced component file, an ignore file, `package.json`, a deprecated file. Dirt anywhere else (`tests/`, KATA code, a protected or bootstrap-only file) is listed as `N ruta(s) con cambios sin commitear fuera de lo que este updater escribe; no bloquean` and never aborts `--auto`.
- **No overwritten-edit row for a path upstream added after the lock cursor.** A file with no base copy at the cursor cannot be told apart from one that arrived another way (a migrated Claude-era repo had every moved skill in that state); unknown is never reported as an edit.
- **`.context/PBI/` still tracked in git.** One Componentes row (`N tracked path(s) still in git ...; migration recipe saved to .agents/prompts/pbi-cache-migration.md`); the recipe (tag, `git rm --cached`, commit, resync, push-to-Jira pass) lives in that gitignored file, never in the terminal. `--dry-run` shows the row without writing the file; the 8.2 file name `pbi-cache-migration-prompt.md` is removed when the recipe is written.
- **A freshly protected path gets no residual row.** A path just declared in `updater.protected_paths` has its upstream marker seeded silently (one `sin fila esta vez` note); its drift row fires on the next upstream change.
- **The `cli` lock cursor advances after a self-update.** The parent hands the sha it refreshed `cli/` to through `UPEX_UPDATER_SELF_UPDATED`; the re-exec child, which finds nothing left to sync there, settles the component at that sha instead of leaving `cli@<scaffold sha>` in the lock.
- **MCP registries are compared per server.** `.mcp.json`, `opencode.jsonc` and `.codex/config.toml` rows name the server and the fields that differ (`context7: args differ`, `supabase: env keys differ`), at most three servers named, the rest counted, instead of `same keys and values` when only a nested field changed.

---

## What stays local (committed in this repo)

Skills that are workflow-specific to this boilerplate live in `.agents/skills/` and are committed to the repo. They install with the clone — no external installer required. All three harnesses read that one directory (§ Multi-harness layout above).

| Skill                   | Trigger                                  | Why it stays local                                                                                                                                                                                                             |
| ----------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `agentic-qa-core`       | (auto, cited by other skills)            | Foundation: passive reference host for briefing template, dispatch patterns, orchestration doctrine, skill-composition strategy                                                                                                |
| `agentic-qa-onboard`    | `/agentic-qa-onboard`                    | First-time orientation tour (this is the entry point for new contributors)                                                                                                                                                     |
| `project-discovery`     | `/project-discovery`                     | 4-phase reverse-engineering of a target project (Constitution → Specification)                                                                                                                                                 |
| `shift-left-testing`    | `/shift-left-testing`                    | Stage 0: pre-sprint AC refinement on a batch of backlog Stories. Authors the pre-sprint ATP (outline maturity) into the `{{jira.acceptance_test_plan}}` field, surfaces gaps, transitions `backlog → shift_left_qa → estimation`. |
| `sprint-testing`        | `/sprint-testing`                        | Stages 1-3: per-ticket manual QA loop (planning, execution, reporting). Short-circuits Phases 1-3 when the Story carries label `shift-left-reviewed` <30 days old.                                                             |
| `test-documentation`    | `/test-documentation`                    | Stage 4: TMS test-case authoring + ROI prioritization (Jira/Xray bridge)                                                                                                                                                       |
| `test-automation`       | `/test-automation`                       | Stage 5: KATA + Playwright + TS test authoring (plan → code → review)                                                                                                                                                          |
| `regression-testing`    | `/regression-testing`                    | Stage 6: CI suite execution, failure classification, GO/NO-GO verdict                                                                                                                                                          |
| `framework-development` | `/framework-development`                 | Gateway for evolving the boilerplate itself (KATA bases, fixtures, `cli/`, `scripts/`, `api/schemas/` pipeline). NOT for per-ticket QA. Self-contained Plan → Code → Verify → Archive pipeline; runs under the minimal preset. |
| `acli`                  | `/acli`                                  | Atlassian CLI wrapper for Jira/Confluence terminal work                                                                                                                                                                        |
| `xray-cli`              | `/xray-cli`                              | Xray Cloud TMS CLI (test creation, executions, JUnit/Cucumber import)                                                                                                                                                          |
| `adapt-framework`       | `/adapt-framework`                       | Idempotent KATA adaptation: no-write analysis and plan first, mutation only after explicit approval                                                                                                                             |
| `project-context`       | `project-context` (+ legacy aliases)     | Regenerates the business data / feature / API maps and the master test plan through isolated modes                                                                                                                             |
| `sync-ai-context`       | `sync-ai-context` (+ `/sync-ai-memory`)  | Synchronizes the AI-critical repo docs against the canonical instructions, skills, aliases, `.context/` and `package.json`                                                                                                      |
| `jira-administration`   | legacy `/jira-components`, `/jira-instance-migration` | Components reconciliation + Atlassian instance migration, each sealed behind read-first analysis and approval                                                                                                       |
| `pr-review-lead`        | `pr-review-lead`, "review this PR"       | QA Lead review of a PR's test-automation work against KATA doctrine; never posts to GitHub without explicit final OK                                                                                                            |
| `bug-screenshot-annotation` | "annotate bug screenshot", "anota este bug" | Turns a raw bug screenshot into annotated QA evidence, rendered 100% locally. Loaded inline by `/sprint-testing` Stage 2                                                                                                |
| `git-flow-master`       | (auto on git intents)                    | End-to-end Git operator (branch, commit, push, PR, conflict, chained-PR)                                                                                                                                                       |
| `judgment-day`          | `/judgment-day`, `juzgar`, `dual review` | T2 vendored (gentle-ai, Apache-2.0). Adversarial dual-judge review (2 blind judges in parallel, fix loop, re-judge). Cited as optional gate by `/test-automation` Phase 3 + `/git-flow-master` pre-PR. Never auto-invoked.     |

These skills evolve with the repo and are versioned in git. The split is intentional: gentle-ai owns persistent memory (Engram); this repo owns the **vertical** workflow (specific to the QA stages 1-6 pipeline) plus a small set of vendored helpers (`judgment-day`).

### Slash commands are transport, not workflow

Ten legacy slash commands survive as thin aliases onto the skills above. Each entry in `.agents/compatibility/command-aliases.json` names a target skill plus a mode; the generated wrapper only selects and forwards `$ARGUMENTS`. `agents:compat:check` rejects an alias whose target skill or declared mode does not exist. Project-owned commands go in the overlay `.agents/compatibility/command-aliases.project.json` (see Regenerating and verifying above), never into the upstream manifest.

| Command | Target skill | Mode |
|---------|--------------|------|
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

On Codex there are no wrappers at all — invoke the target skill and its mode directly.

---

## Keeping the framework up to date — `.template/boilerplate.lock.json`

After the first time you run `bun run up`, the CLI creates `.template/boilerplate.lock.json` at the project root. This file tracks the last upstream-template git SHA for each synced component (`.agents/skills/`, `.agents/compatibility/`, `.claude/commands/` + `.opencode/commands/`, `.codex/`, `scripts/`, `cli/`, `.husky/`, etc.). It is safe, and recommended, to **commit this file**: your team and CI workflows need it to know which template version each component is on. Subsequent `bun run up` runs read the stored SHAs to compute precise per-file deltas, so only genuinely changed files are surfaced. What each run reports, which files are protected, and the 8.2 flags (`--strict`, `--no-gates`, `--dry-run` with the new updater, `updater.protected_paths`) are described under [What every `bun run up` reports](#what-every-bun-run-up-reports) and in the README section [Keeping your project in sync](README.md#keeping-your-project-in-sync-with-the-boilerplate).

**Requirement**: `git ≥ 2.25` must be on your `$PATH` (required for sparse-checkout with `--filter=blob:none`). Run `git --version` to check; upgrade instructions are printed by the CLI if the version is too old.

---

## External CLIs (verified, not auto-installed)

The installer's step 10 (`verifyExternalClis`) runs a PATH probe — `which <binary>` on POSIX, `where <binary>` on Windows — for six command-line tools that other parts of the QA workflow depend on. This is a **presence-only** check: no version compare, no auto-install. If any are missing, the installer **prints the suggested install command and the official docs URL — but does not run anything**. System-level CLIs touch user permissions (Homebrew taps, apt, curl piped into bash, winget) and are not portable cross-platform, so auto-installing them without consent would be invasive. The user installs them manually following the docs URL.

| CLI              | Powers in this repo                                                                                      | Install (cross-platform)            | Official docs                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `bun`            | Runtime for every script (`bun run setup`, `bun xray`, `bun run test`)                                   | See official docs                   | [bun.com](https://bun.com/)                                                                           |
| `gh`             | GitHub PR / Actions workflows from `/git-flow-master`, `/regression-testing`                             | See official docs                   | [github.com/cli/cli#installation](https://github.com/cli/cli#installation)                            |
| `acli`           | Jira/Confluence from terminal (`/acli`, `/shift-left-testing`, `/sprint-testing`, `/test-documentation`) | See official docs                   | [developer.atlassian.com/cloud/acli](https://developer.atlassian.com/cloud/acli/guides/install-acli/) |
| `playwright-cli` | Agent-driven browser automation (`/playwright-cli` skill)                                                | `bun add -g @playwright/cli@latest` | [playwright.dev/agent-cli](https://playwright.dev/agent-cli/introduction)                             |
| `resend`         | Email testing flows                                                                                      | See official docs                   | [resend.com/docs/cli](https://resend.com/docs/cli)                                                    |
| `jq`             | JSON parsing in acli Jira pipelines (advanced `acli --json \| jq …`)                                     | See official docs                   | [jqlang.github.io/jq/download](https://jqlang.github.io/jq/download)                                  |
| `rg`             | Repo search every agent leans on. Claude Code bundles its own; **OpenCode and Codex fall through to the system binary** | See official docs                   | [github.com/BurntSushi/ripgrep](https://github.com/BurntSushi/ripgrep#installation)                   |

> **Important — `playwright-cli` is NOT `@playwright/test`**: this is the agent-driven browser CLI from the `@playwright/cli` npm package, installed **globally**. It produces a binary literally named `playwright-cli` (not `playwright`). The `@playwright/test` library that ships as a devDependency in this repo is a separate thing — it powers the test runner (`bun run test`), not the `/playwright-cli` skill. Don't confuse them.

> **Why verify and not install?** Auto-installing system-level binaries from a project script would require asking for sudo/admin, picking a package manager per OS, and trusting that the user wants those tools in `$PATH` permanently. Verify-and-direct-to-docs is the polite alternative: you see what's missing, you read the official docs, you decide.

---

## Hand-off matrix — `/shift-left-testing` vs `/sprint-testing` vs `/test-automation` vs `/framework-development`

This is the most common point of confusion.

| When                                                                    | Skill                                     |
| ----------------------------------------------------------------------- | ----------------------------------------- |
| Pre-sprint AC refinement on a batch of backlog Stories (Stage 0)        | `/shift-left-testing` (batch-grooming)    |
| Routine in-sprint QA on a Jira ticket (most cases)                      | `/sprint-testing` (ticket-driven)         |
| Authoring an automated test for a Candidate TC                          | `/test-automation` (Plan → Code → Review) |
| Refactor of the boilerplate itself — KATA bases, fixtures, cli, scripts | `/framework-development`                  |

### When to reach for `/shift-left-testing`

Pre-sprint, BEFORE the Story enters a sprint. The team grooms a batch of N backlog Stories (`Backlog` / `Shift-Left QA` / `Estimation` / `Ready For Dev` status) and wants QA to refine ACs, surface gaps + ambiguities + edge cases, and draft an ATP outline so PO + Dev lead can estimate cleanly. No execution — feature does not exist yet. Output: refined ACs in Jira, pre-sprint ATP (outline maturity) authored into the `{{jira.acceptance_test_plan}}` field (the Test Plan item is created later by `/sprint-testing` Stage 1), batch report to PO/Dev lead, transition `backlog → shift_left_qa → estimation`. Once each Story later reaches `Ready For QA`, `/sprint-testing` Stage 1 short-circuits Phases 1-3 (label `shift-left-reviewed` detected, <30 days old).

Example: "groom UPEX-100, 101, 102, 103 before next sprint planning." Stories are in `Backlog`, ACs are sparse, you want a single batch session that produces refined ACs + PO/Dev question set + ATP outlines per Story.

### When to reach for `/sprint-testing`

The default choice for normal sprint QA. You have a ready-for-QA Jira ticket, AC is reasonably clear, the change is bounded (one feature, one bug fix, one regression). You want the standard cycle: plan, execute trifuerza (UI/API/DB) exploration, run smoke + regression, file ATP/ATR + bug reports, transition the ticket. Nothing about the QA work requires multi-phase architectural design — a clear test plan is enough.

Example: "Test UPEX-277 — empty states on the user-list filter." Ticket is `Ready For QA`, AC is 3 bullets, scope is one component plus one API. `/sprint-testing` drives the whole thing.

### When to reach for `/framework-development`

The right choice when the change is to the boilerplate's own infrastructure (KATA layers, fixtures, installer, OpenAPI sync pipeline, skill doctrine), not to a per-ticket test. Examples: "add a new `{ admin }` fixture", "refactor the OpenAPI sync to support v3.1 schemas", "modify `KataPageBase` to support shared selectors". This is internal QA infrastructure, not test authoring.

`/framework-development` ships self-contained: Phase 0 (path self-check) → Phase 1 Plan (single subagent writes `.scratch/framework-changes/<change>/plan.md`) → Phase 2 Code (sequential per task batch) → Phase 3 Verify (4 parallel verifiers: `bun run test`, `types:check`, `lint:check`, `skills:check`) → Phase 4 Archive (inline). No SDD-\* skills required; runs under the minimal preset out of the box.

---

## Troubleshooting

- **`jira:sync-fields` / `jira:sync-workflows` skipped with "not an Administrator"** — your authenticated Jira user does not have `ADMINISTER` (global) or `ADMINISTER_PROJECTS` (project-scoped) permission. The scripts pre-flight `/rest/api/3/mypermissions` to avoid mid-run 403s. The installer records `state.postInstall.jiraSync* = "skipped-no-admin"` and exits Step 13 cleanly — repo stays usable (any missing catalog gets an empty `{}` placeholder, see below). Two recovery paths: (a) ask a Jira admin to run the scripts and commit the resulting `.agents/jira-*.json` to the team repo; (b) re-run `bun run setup --force-step 13-jira-sync` and pick the **UPEX-Galaxy standard** source — or run `bun run jira:sync-fields --upex && bun run jira:sync-workflows --upex` directly to pull the UPEX-standard catalog from `upex-galaxy/agentic-qa-boilerplate@main` (no admin, no Jira API calls — just a GitHub raw fetch).
- **Pre-push rejected — `lint:skills` STALE-PATH: `.agents/jira-fields.json` / `jira-workflows.json` does not exist on disk** — the bootstrap scaffolder prunes those two catalogs from a fresh project, and a no-admin / skipped Jira sync left the SKILL.md-referenced paths dangling. Setup now writes an empty `{}` placeholder for any missing catalog (Step 13), so a fresh `bun run setup` self-heals this. If you hit it on an older project, just create the files: `echo '{}' > .agents/jira-fields.json` and the same for `jira-workflows.json` (then optionally `bun run jira:sync-fields` to populate). The `{}` form is valid JSON, satisfies the lint, and is treated as "unpopulated" so a later sync fills it without `--force`.
- **`--upex` flag** — every `jira:sync-*` script (`fields`, `workflows`, `link-types`) accepts `--upex` to download the UPEX-standard reference JSON from the upstream boilerplate repo. URL is hardcoded per script and pinned to `main`. Bypasses ATLASSIAN_* env vars, `project_key`, `jira-required.yaml` and all Jira REST calls; only network requirement is GitHub raw access. Useful when (a) you have no Jira admin, (b) you want a working catalog without setting up auth, or (c) you want to compare against the canonical UPEX standard before custom-syncing.
- **gentle-ai not detected after install** — re-run `bun run setup`. The detector probes `which gentle-ai` plus `gentle-ai version`; if either fails the installer falls back to the "skip gentle-ai" branch. Confirm the binary is on PATH (`which gentle-ai` should return a path under `/usr/local/bin/`, `~/bin/`, `~/go/bin/`, or a Homebrew prefix).
- **MCPs returning 401/403** — the matching env var in `.env` is unset or wrong. All three MCP configs (`.mcp.json`, `opencode.jsonc`, `.codex/config.toml`) are committed with placeholders; real values live in `.env`. Open `.env`, fill the var, and **restart the agent session** — env vars are read once at MCP-server spawn time. See `AGENTS.md` Critical Rule #10.
- **MCPs not loading at all** — confirm you launched the agent via `bun run claude` / `bun run opencode` / `bun run codex` (each wraps with `dotenv-cli`), or that direnv autoload is active (`direnv status` shows your `.envrc` allowed). Launching the bare binary without either path means MCP placeholders never get expanded.
- **Codex ignores `.codex/config.toml` and the hook never fires** — the repository is not marked trusted. Codex loads project `.codex/` config and hooks only in a trusted repo, and that is runtime state no file check can see. `bun run setup:doctor` reports it on its own line; approve trust in Codex, then restart the session.
- **A slash command or skill alias disappeared after an edit** — you probably hand-edited a generated wrapper under `.claude/commands/` or `.opencode/commands/`, or the `.claude/skills` alias. Fix the source instead: `.agents/compatibility/command-aliases.json` for commands, `.agents/skills/` for skills, then run `bun run agents:compat`. Verify with `bun run agents:compat:check`.
- **`direnv allow` produced `dotenv_if_exists: command not found`** — this would mean the `.envrc` is using a newer direnv feature than your version supports. The committed `.envrc` uses portable POSIX loading (works on direnv 2.21+), so if you see this, your `.envrc` has been edited locally — restore it from `git checkout .envrc`.
- **Skills not appearing in autocomplete** — restart Claude Code (or your agent of choice). MCP and skill configs are cached at agent startup. On Claude Code specifically, also confirm the `.claude/skills` alias exists; if a checkout dropped it, `bun run agents:compat` recreates it.
- **`/agentic-qa-onboard` does not trigger on natural language** — use the explicit slash command: `/agentic-qa-onboard`. The natural-language triggers (`onboard me to QA`, `primer vez en QA`) are advisory, not guaranteed.
- **How do I uninstall gentle-ai engram?** — `gentle-ai uninstall --agent <agent> --components engram --yes` removes the engram component for one agent. `gentle-ai uninstall --all --yes` removes everything gentle-ai-managed for every supported agent. Note the asymmetry vs `install`: `uninstall` accepts `--yes`/`-y` (skip confirmation) but does NOT accept `--skill(s)`. Backups are created automatically before uninstall.

---

## How to opt out

If you prefer not to use gentle-ai, the installer accepts a "skip" choice. To make it permanent:

1. Edit `.template/installer.state.json` and set `"gentleAi": { "status": "skipped" }`.
2. Re-run `bun run setup`. The installer detects the skipped state and only configures the 6 canonical MCPs.

What you lose:

- **Persistent memory (Engram)** — no cross-session recall, no `mem_save` / `mem_search`. Each session starts blind.

What you keep: every workflow skill committed in this repo (`/sprint-testing`, `/test-documentation`, `/test-automation`, `/regression-testing`, `/agentic-qa-core`, `/agentic-qa-onboard`, `/playwright-cli`, `/acli`, `/xray-cli`, `/project-discovery`, `/git-flow-master`, vendored `/judgment-day`) and the 6 canonical MCPs (Context7, Tavily, Playwright, DBHub, OpenAPI, Postman). The Atlassian MCP is opt-in — see docs/mcp/ to enable it manually after install. The repo is fully usable without gentle-ai — the integration is additive.

---

## See also

- [AGENTS.md](./AGENTS.md) — the single instruction body every harness loads; §4.5 covers the multi-harness contract
- [CONTEXT.md](./CONTEXT.md) — context-engineering strategy and the surface-by-harness map
- [.agents/skills/agentic-qa-onboard/SKILL.md](./.agents/skills/agentic-qa-onboard/SKILL.md) — the orientation skill itself, entry point for `/agentic-qa-onboard`
- [docs/setup/README.md](./docs/setup/README.md) — index of setup guides in this repo
- [docs/setup/jira-setup-guide.md](./docs/setup/jira-setup-guide.md) — Jira/Atlassian credentials + acli login flow
- [docs/setup/mcp-dbhub.md](./docs/setup/mcp-dbhub.md) / [mcp-openapi.md](./docs/setup/mcp-openapi.md) — MCP-specific setup notes

---

> **You are here**: What `bun run setup` configures. **Read time**: 10 min. **Next**: `bun cli/doctor.ts` to verify, or [`README.md`](README.md) to navigate.
