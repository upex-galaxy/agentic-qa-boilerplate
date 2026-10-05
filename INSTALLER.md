# The installer — what `bun run setup` configures

> **Audience**: QA engineers cloning `agentic-qa-boilerplate` for the first time, or anyone wanting to understand what `bun run setup` configures (Engram memory, community skills, MCPs, local skills) and what is optional.
> This document is the **contract that `cli/install.ts` implements**. The four layers of the workstation — Engram persistent memory (wired per agent with `engram setup`), community skills via `bunx skills`, locally committed workflow skills (including the vendored `judgment-day`), and the MCP servers `.mcp.json` declares — are documented below in that order.

---

## Install flow

`bun run setup` runs in named phases. Each phase is labelled in the terminal output. The installer is **idempotent**: every step writes a timestamp to `.template/installer.state.json` on success, and re-runs skip completed steps automatically.

### Phase 1 — DETECTION

Probes the environment before touching anything. Detects the `engram` binary (version + compatibility), loads or creates `.template/installer.state.json`, and prompts for agent selection across the three supported harnesses — **Claude Code, OpenCode, Codex**. Everything detected is pre-checked; you tick off whatever you don't want configured. Exits early if none of the three is present, or if the user asks for the engram install guide.

Detection per harness:

| Harness | Counts as detected when | Selection label |
|---------|-------------------------|-----------------|
| Claude Code | `~/.claude/` exists **or** the `claude` binary is on PATH | `Claude Code (executable/config found)` |
| OpenCode | `~/.config/opencode/` exists **or** the `opencode` binary is on PATH | `OpenCode (executable/config found)` |
| Codex | the `codex` binary is on PATH **or** this repo already has `.codex/config.toml` | `Codex (CLI found; Desktop uses the same repository config)`, or `Codex Desktop target (repository configured; CLI not found)` |

Codex Desktop needs no separate entry: it consumes the same repository configuration as the CLI, so a repo that carries `.codex/config.toml` is already a valid Codex target even with no CLI installed. A Dock launch has no process environment, so each MCP server in that file starts through a `.env` loader: the desktop app needs `bun install` (for `varlock`) and a filled `.env` at the project root. A worktree the Codex app creates copies `.env` through the committed `.worktreeinclude` and then runs `bun run worktree:provision` (dependencies, git hooks, the rest of the gitignored inputs) through the committed `.codex/environments/environment.toml`.

### Phase 2 — INSTALLATION

Downloads and installs all software dependencies:

- `bun install` — project Node/Bun packages including `@playwright/test`
- `bun run pw:install` — Playwright browser binaries (Chromium)
- `engram setup <agent>` — wires Engram persistent memory into each selected agent (one call per agent) — see [What `engram setup` adds](#what-engram-setup-adds) below.
- `bunx skills add` — project-level skills (`PROJECT_LEVEL_SKILLS` in `cli/install.ts`) and user-level skills (`USER_LEVEL_SKILLS`, cross-project utilities)

### Phase 3 — CONFIGURATION

Wires runtime configuration:

- Where secret values live: `.env` is the default and comes first. The step also offers a secret manager as the ADVANCED option (adapters live in `cli/lib/secret-providers.ts`). Choosing it records `secrets:` in `.agents/project.yaml` and writes `.env.provider.schema` once (references only, committed; never overwritten), then prints the one-time setup. See "Secret manager (advanced)" below
- `.env` population — discovers the variables each MCP server needs from the MCP config of every selected harness (the `.env` loader's `--filter` list, the same in `.mcp.json`, `opencode.jsonc` and `.codex/config.toml`; a legacy `${VAR}` / `{file:}` / `env_vars` / `bearer_token_env_var` reference is still read), then prompts for values not already set
- Plaintext MCP credential copies (Step 15): retires what an older `bun run harness:env` generated (the `env` block of `.claude/settings.local.json`, `.auth/opencode/<VAR>`). A copy equal to `.env` is deleted, a copy `.env` does not reproduce is moved to `.auth/harness-env-backup/<VAR>` (mode 0600) and named so you put the right value in `.env` and delete the directory, and a copy a legacy host config still reads is kept. `bun run harness:env` does the same on its own (`--check` exits 1 while a stale copy remains, `--dry-run` changes nothing); `bun run setup --variables` regenerates nothing. After filling `.env`, restart the agent session (MCP servers read `.env` through the `.env` loader when the harness spawns them)
- GitHub repository — interactive `gh repo create` (optional); hydrates `state.github` from an existing remote if already wired

### Phase 4 — VERIFICATION

Validates the environment is usable:

- External CLI table — `which`-checks every entry of `EXTERNAL_CLIS` in `cli/install.ts` and prints a status table with purpose and install hint for missing entries
- State persistence — writes updated `.template/installer.state.json`

### Phase 5 — INITIAL CONFIGURATION

Interactive post-install configuration steps. Skipped automatically when no TTY is detected (CI / non-interactive mode):

- `agents:setup` — populates `.agents/project.yaml` with project identity, Jira URL, environments
- `acli` auth probe — collects `ATLASSIAN_EMAIL` / `ATLASSIAN_API_TOKEN` into `.env` and the site host into `.agents/project.yaml` if missing, then runs `acli jira auth login` (stdin-piped token, `--site` from `bun run jira:url --slug`)
- **Jira catalogs sync (step `13-jira-sync`)** — one prompt picks the catalog source for the whole project, then syncs custom fields + workflow statuses/transitions accordingly:
  - **My own Jira workspace** — runs the Jira auth loop, then `jira:sync-fields --force` + `jira:sync-workflows --force`. **Requires Jira `Administer` permission** (global or project-scoped); without it the scripts exit 0 and the step records `state.postInstall.jiraSync* = "skipped-no-admin"`.
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

The step keys are listed in the header comment of `cli/install.ts`. The install steps write an ISO timestamp on success and are skipped on re-run; the Phase 1 detection steps and the Phase 4 verification / persistence steps always re-run since they probe live state. Phase 5 post-install steps (`agents:setup`, `acli:auth`, `jira:sync-fields`, `jira:sync-workflows`, `jira:check`) track status under `state.postInstall.*` rather than `state.steps`.

---

## Before you run setup — prerequisites

The installer is self-diagnosing: every stage prints the exact install URL or command when it detects something missing. But you will iterate faster if you front-load the hard blockers below. For the same checklist with brief tables, see the top of [`README.md`](./README.md#prerequisites).

### Hard blockers — installer exits 1 if missing

| Tool                                                                               | Min version | Enforced at                                 | Message you see on failure                                                                      |
| ---------------------------------------------------------------------------------- | ----------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Bun**                                                                            | the floor the preflight enforces | `bun run setup:doctor --preflight`             | `✗ Preflight failed · Bun X.Y.Z is too old (need >= <min>) · Fix: bun upgrade`                  |
| **`node` (the real binary)**: hooks run `node .agents/hooks/personality-reinject.mjs` | `MIN_NODE_MAJOR` in `cli/doctor.ts` | Scaffolder doctor (`packages/…/doctor.ts`) + `bun run setup:doctor --preflight` | `node >= <min> · not found on PATH — install node >= <min>: https://nodejs.org`                       |
| **`node_modules/@inquirer/prompts`** (proxy for `bun install`)                     | —           | Preflight                                   | `✗ Preflight failed · Missing node_modules/@inquirer/prompts · Fix: bun install`                |
| **Agent** — Claude Code (`~/.claude/`), OpenCode (`~/.config/opencode/`) **or** Codex (`codex` on PATH, or `.codex/config.toml` in the repo) | latest      | Step `4-agent-detect` (agent selection)                    | `✗ No agent executable or Codex repository configuration detected.` followed by all three docs URLs |
| `git`                                                                              | any         | Scaffolder (`packages/create-agentic-qa/src/runners.ts`) + Husky hooks  | `ENVIRONMENT · git is required but not found on PATH. · Install: https://git-scm.com/downloads` |
| `tar`                                                                              | any         | Scaffolder (`download.ts`)                  | `ENVIRONMENT · \`tar\` not found on PATH.`                                                      |

The agent check is the gotcha that bites first-timers most often: a missing `gh` or `acli` just yields a warning later, but zero detected agents hard-stops `4-agent-detect`. Install at least one of Claude Code, OpenCode, or Codex first, then run `bun run setup`.

### Windows

PowerShell and cmd are supported directly — WSL and Git Bash work too, but neither is required. Two Windows-specific notes:

- **Install Bun with `powershell -c "irm bun.sh/install.ps1 | iex"`**, not `npm i -g bun`. The npm route writes only a `bun.cmd` shim (no `bun.exe`), which the scaffolder has to launch through `cmd.exe`.
- **`tar` needs no extra install.** Windows 10 1803+ and Windows 11 ship bsdtar at `C:\Windows\System32\tar.exe`, and the scaffolder builds a tar command line that both bsdtar and GNU tar accept.

Under WSL, keep the project on the Linux filesystem (`~/projects/...`). On a `/mnt/c` path Bun cannot create its bin shims and `bun install` fails with `could not open bin metadata file`.

### Quasi-required — installer warns and offers install commands

| Tool          | Min version | Enforced at                   | What happens on miss                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------- | ----------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **engram** | `MIN_ENGRAM_VERSION` in `cli/install.ts` | `detectEngram` in `cli/install.ts` (step `2-gentle-ai-detect`, key name kept for state compatibility) | Prints `engram not detected on PATH.` then offers two paths: (a) show install commands (Homebrew on macOS / Linux: `brew trust gentleman-programming/tap && brew install gentleman-programming/tap/engram`; any OS with Go: `go install github.com/Gentleman-Programming/engram/v3/cmd/engram@latest`) and exit, or (b) continue without Engram. A version below the minimum (or a `go install` build that reports no release version) asks whether to try anyway. |

Homebrew refuses formulas from a tap it does not trust, which is why the tap is trusted first. Upgrade later with `brew upgrade engram`.

If you skip Engram, persistent memory is NOT wired (no cross-session memory). The committed skills keep working, and the MCP servers `.mcp.json` declares are still configured.

### Per-skill CLIs — lazy-required, non-blocking at setup

These CLIs are **not optional** for the workflow — each one is consumed by a specific skill, and its `EXTERNAL_CLIS` entry in `cli/install.ts` names which. The installer cannot guess which skills you will run, so it ships them as **lazy-required**: a missing binary surfaces as a warning during step `11-verify-clis` but never blocks setup. Install them up front if you plan to use the whole stack, or on-demand when the owning skill surfaces a missing-binary error.

The check itself is a **PATH probe** (`which <name>` on POSIX, `where <name>` on Windows — see `verifyExternalClis` in `cli/install.ts`). Presence only — no version compare, no auto-install.

Step `11-verify-clis` (`verifyExternalClis`) iterates the `EXTERNAL_CLIS` array in `cli/install.ts` and prints a per-CLI status table (example output):

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

### Variables — what goes into `.env`, by scope

`cli/lib/variables-manifest.ts` declares the `VAR_MANIFEST` that the installer, `cli/doctor.ts` and the updater read. Every entry carries a `scope` (ADR-0005), and the scope decides how its absence is reported: never as a blocker.

```
core      ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN → https://id.atlassian.com/manage-profile/security/api-tokens
          (offered at day-0, skip is fine; needed once the Jira host is set with `bun run agents:setup`)
project   API_BASE_URL, OPENAPI_SPEC_PATH, DBHUB_*, <ENV>_USER_* → your backend / database / test accounts
          (examples: rename or delete when you adapt the framework)
tooling   CI-only secrets (Slack, private report portal) → GitHub Actions, pushed by `setup --variables --remote`
```

A value with a `#` must be quoted in `.env` (`PASSWORD="pass#word"`): varlock cuts an unquoted value at the first `#`.

Not in `.env` at all: MCP servers that run at harness level (web search, Postman; connect them once per machine, see the installer's closing guidance) and CLI logins (`acli auth login`, `resend login`).

### Secret manager (advanced)

Optional, for a team that shares its secrets in a vault instead of each person's `.env` (ADR-0010). `.env` keeps working for everyone else, and a non-empty `.env` / `.env.local` value always wins over the vault.

1. Install the 1Password desktop app and its CLI `op` (macOS: `brew install 1password-cli`), then enable Settings > Developer > "Integrate with 1Password CLI".
2. Run `bun run setup` and pick 1Password. Team: a shared vault (`<project>-dev`). Personal plan: your own vault; it works locally, CI cannot read it.
3. In the vault, one Password item per variable, titled with the variable NAME. In `.env.provider.schema`, uncomment those lines and leave the keys empty in `.env`.
4. Check, redacted: `bunx varlock load --agent`. Bun's own `.env` autoload does not resolve the `op://` references, so a script that needs a vault secret runs through `bunx varlock run -- <cmd>`.
5. CI (team plan): a service account with read access to the vault; its token is the GitHub secret `OP_SERVICE_ACCOUNT_TOKEN`, beside the per-variable secrets (never instead).

Non-interactive: `INSTALL_SECRETS_PROVIDER=1password INSTALL_SECRETS_VAULT=<vault> bun run setup --non-interactive`. Other managers varlock supports plug into the same slot (`cli/lib/secret-providers.ts`); none ships configured.

### Where to verify your status

| Command                            | What it does                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `bun run setup:doctor --preflight` | Fast Bun / deps check only — exit 0 if green, 1 with explicit fix command otherwise                                  |
| `bun run setup:doctor`             | Full report: env vars, deps, Playwright browsers, MCP config files for the harnesses in use (`harnesses:`), plaintext MCP credential copies an older version left, pending actions with `where` URLs |
| `bun run setup:doctor --json`      | Same as above as machine-readable JSON for an agent to consume                                                       |
| `bun run setup`                    | Re-run the interactive installer end-to-end (idempotent — completed steps are skipped, MCP overwrites are confirmed) |

---

## Running setup from an AI agent

Most users ask an AI (Claude Code, OpenCode, Codex, …) to drive the setup instead of running it by hand. The installer is built for both flows; the AI path uses a few specific entry points:

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
  "env_vars": { "ATLASSIAN_EMAIL": "set", "API_BASE_URL": "missing", ... },
  "env_var_scopes": [ { "name": "API_BASE_URL", "status": "missing", "scope": "project", "feature_gate": null, "gate_on": null, "used_by": "openapi MCP request base; curl execution after bun run api:login", "verdict": "missing-optional" }, ... ],
  "harness_level_mcps": { "verdicts": [ { "id": "tavily", "capability": "web-search", "state": "not detectable", "hosts": [], "detail": "..." } ], "sources": [] },
  "pending_actions": [
    { "type": "shell_command", "target": "bun run api:sync", "hint": "..." }
  ]
}
```

`pending_actions[].type` is one of: `credential` · `shell_command`. A `credential` entry appears in `pending_actions` only for a core variable with no default and no feature switch (the manifest decides which); a core credential behind a switch that is on lands in `warnings` instead, and project / tooling variables are rows in `env_var_scopes`, never actions. The AI iterates the list and picks the right tool per type:

| type             | Who handles it | How                                                                                                                             |
| ---------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `credential`     | **User**       | The user types it in their own terminal (or stores it in the secret manager); the AI names the variable and the `where` URL and stops. A non-sensitive value (URL, key, flag, port) the AI may write with `bun run env:set KEY=value` when asked. |
| `shell_command`  | **AI**         | AI runs the `target` command via Bash.                                                                                          |

### What an AI **cannot** do (hard limits)

- **Generate API tokens** — Atlassian, Xray and every harness-level MCP key require an interactive web login + 2FA. The user creates them and types them into `.env` or the secret manager; the AI never sees the generation flow or the value.
- **Decide business config** — e.g. `TEST_ENV=local` vs `staging`, which modules to automate first, etc. The AI suggests; the user decides.
- **Execute privileged installs cleanly** — `brew install`, `winget install`, `apt install` may show a sudo/admin prompt that lives outside the agent's terminal. The AI runs the command but the user clicks "allow".

### `bun run setup --non-interactive` (or just `bun run setup` without a TTY)

The installer auto-detects no-TTY (an agent invoking it without a terminal) and silently switches to `--non-interactive`. Prompts skip with their default answer. The closing summary ends with an explicit block `Ask the human for these N keys: ...` (names only, never values) followed by the next two steps: the human writes them to `.env` (never through the chat), then restart the agent session. Same data the doctor exposes. Use this path when the AI wants to run the full setup batch:

```bash
INSTALL_AGENTS=claude-code,opencode,codex bun run setup --non-interactive
```

The command carries no secret: the human fills the credentials afterwards in `.env` or the secret manager (Critical Rule #1). Then `bun run setup:doctor --json` to confirm.

### Skip flags (per-step opt-out)

| Env var                       | Effect                           |
| ----------------------------- | -------------------------------- |
| `INSTALL_SKIP_ENGRAM=1`       | Treat Engram as skipped (legacy alias: `INSTALL_SKIP_GENTLE_AI=1`) |
| `INSTALL_SKIP_DEPS=1`         | Skip `bun install`               |
| `INSTALL_SKIP_PLAYWRIGHT=1`   | Skip `bun run pw:install`        |
| `INSTALL_SKIP_AGENTS_SETUP=1` | Skip `bun run agents:setup`      |
| `INSTALL_SKIP_COMMUNITY=1`    | Skip `bunx skills add` step      |
| `INSTALL_SKIP_JIRA=1`         | Skip optional Jira bootstrap     |
| `INSTALL_SKIP_API=1`          | Skip optional API auth bootstrap |
| `INSTALL_SECRETS_PROVIDER=1password` | Opt in to the secret manager (default `.env`); pair with `INSTALL_SECRETS_VAULT=<vault>` |

### Force flags (re-run completed steps)

| Flag / Env var                 | Effect                                        |
| ------------------------------ | --------------------------------------------- |
| `--force`                      | Clear all step timestamps — re-run everything |
| `--force-step <key>`           | Re-run one step by key                        |
| `INSTALL_FORCE_ALL=1`          | Same as `--force`                             |
| `INSTALL_FORCE_ENGRAM=1`       | Re-run `engram setup` (legacy alias: `INSTALL_FORCE_GENTLE_AI=1`) |
| `INSTALL_FORCE_COMMUNITY=1`    | Re-run community skill install                |
| `INSTALL_FORCE_GITHUB=1`       | Re-run GitHub remote setup                    |
| `INSTALL_FORCE_AGENTS_SETUP=1` | Re-run agents:setup                           |

---

## Launching the agent after setup

`.env` is the default source of credentials (a secret manager can hold them instead, see "Secret manager (advanced)"), and no harness gets a copy of it. Every MCP server that needs `.env` values starts through the same `.env` loader in `.mcp.json`, `opencode.jsonc` and `.codex/config.toml` (`varlock run`, run through `bunx -p` from the project devDep), so each server reads `.env` itself, and only its own variables, even on a bare or Dock launch. `bun run setup:doctor` reports any plaintext copy an older `bun run harness:env` left behind, and `bun run harness:env` retires it. After filling `.env`, restart the agent session (MCP servers read `.env` when the harness spawns them). `bun run setup` finishes by printing the commands below. Nothing needs `.env` exported into your shell: the Bun scripts (`bun run jira:*`, `bun run api:login`, `bun xray`) read it through Bun's own autoload, `acli` uses its stored login (`acli jira auth login`) and `gh` its keyring.

Open the harness from the repo root, on Windows, macOS or Linux alike: `claude`, `opencode` or `codex`, or the desktop app (Claude Desktop, Codex Desktop, OpenCode desktop) on the project folder. No wrapper and no one-time setup beyond `bun install` (the `.env` loader is the `varlock` devDependency).

All three MCP configs are committed with variable NAMES only: every server that needs `.env` values launches as `bunx -p varlock@<pin> varlock run --no-redact-stdout --inject vars --filter A,B -- <server>`, the same on every host. The loader reads the varlock schema plus `.env` / `.env.local` (or the secret manager the schema names) from the project root at spawn time and hands the server only the names in its `--filter`; `--no-redact-stdout` keeps the JSON-RPC stream intact. Real values live in `.env` (gitignored), and no plaintext copy is written anywhere. If a server returns 401/403 at first call, the matching env var is missing — see `AGENTS.md` Critical Rule #10 (stop, fix `.env`, restart the agent session).

Open the harness directly: no wrapper, no script. Starting it inside `varlock run` would export every `.env` value into the AI's own process, where any command it runs can read them (ADR-0014). Nothing in the repo exports `.env` into a shell: the test scripts (`bun run test`, `test:e2e`, ...) load it through `scripts/launch.ts`, which warns when a variable inherited from the shell differs from `.env.local` over `.env` (names and lengths only) and goes on, so a deliberate `AUTO_SYNC=true bun run test` still works. A project variable you export in your own shell profile still wins over `.env` for whatever starts from that shell, MCP servers included; `bun run vars:env:check` names it.

### Optional cosmetic polish

Pure UX, zero behavioral change. Skip without consequence. Nothing here is auto-installed: each tool is user-level scope and changes an environment outside this repo. The repo assumes no communication-mode plugin: concision comes from `AGENTS.md` §2 and your user-level output style (Critical Rule #13).

| Agent           | Tool                                                        | How                                                                                                                                                                                                                                                                                             |
| --------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude Code** | [`ccstatusline`](https://github.com/sirmalloc/ccstatusline) | `bunx -y ccstatusline@latest` — interactive TUI to customize the Claude Code status line (model, tokens, context %, git branch, etc.). **Run in a plain terminal with no active agent session**; the configurator owns the terminal while it runs and will collide with a live Claude Code TUI. |
| **OpenCode**    | `opencode-subagent-statusline` plugin                       | Optional and personal, so it is NOT in the shared `opencode.jsonc`. Add it to your global `~/.config/opencode/opencode.json` (`"plugin"` on OpenCode 1). It is a V1 plugin: OpenCode 2 refuses to load it until its author ships a V2 entrypoint. Same for `@warp-dot-dev/opencode-warp`, which Warp installs by itself. |

---

## Engram, and why the installer wires it directly

[Engram](https://github.com/Gentleman-Programming/engram) is a local persistent-memory binary with an MCP server. Agents call its tools to store and recall decisions, bug root causes and conventions across sessions. Memories live in a local SQLite database under `~/.engram` by default.

The installer wires Engram with the binary's own `engram setup <agent>`, not with `gentle-ai install`: even with its minimal preset, gentle-ai writes more than memory into the user-level agent config: its own orchestrator and agent-routing instructions, review agents, hooks and telemetry, which compete with this repo's orchestration doctrine (`AGENTS.md` §3). `engram setup` registers the memory server and nothing else. The boilerplate does not use gentle-ai's workflow layer: the committed workflow skills cover Plan → Code → Verify, and adversarial review is the vendored `judgment-day` skill under `.agents/skills/judgment-day/`.

The integration is **not strict**. If you skip Engram, the repo still works: workflow skills committed locally keep functioning, and the MCP servers `.mcp.json` declares are still configured. What you lose is persistent cross-session memory.

### How memory behaves

- **Saving is agent-driven.** Nothing is stored automatically: a memory exists only when the agent calls `mem_save` (or `mem_session_summary` at session close). `AGENTS.md` §12 lists when the agent is expected to save.
- **Search is lexical, not semantic.** Engram matches words (full-text search with trigram matching and BM25 ranking), and by default every term must match. A whole natural-language question usually returns nothing; two or three keywords that would appear in a memory title work. For OR matching, pass `match_mode: "any"` to `mem_search`, or `--match any` to `engram search`.

---

## What `engram setup` adds

`bun run setup` runs one call per selected agent:

```bash
engram setup claude-code --protocol=slim
engram setup opencode
engram setup codex
```

Each call registers the `engram` MCP server for that agent (on Claude Code through `claude mcp add`, into the user config). `--protocol=slim` keeps Claude Code's session-start protocol short and writes no block into your instructions file.

On Claude Code, the session hooks (such as the memory context injected at session start) come from the Engram plugin, which the MCP registration does not install. Right after `engram setup claude-code` succeeds, the installer offers to add it (default yes). It never runs in non-interactive mode, and a declined or failed install only prints the commands, so you can add it yourself once per machine:

```bash
claude plugin marketplace add Gentleman-Programming/engram
claude plugin install engram@engram
```

The plugin ships no MCP server of its own, so you need both: `engram setup` for the server, the plugin for the hooks.

### Re-run safety

`--force-step 8-skills-gentle-ai` (or `INSTALL_FORCE_ENGRAM=1`) re-runs `engram setup` for every selected agent. `engram setup` without an agent opens an interactive menu, so the installer always passes the agent slug.

---

## What gets installed via `bunx skills` CLI

Independent of Engram, the installer also runs the official Anthropic `bunx skills add` CLI to fetch community skills from upstream repos. Two lists, both defined as `const` arrays in `cli/install.ts`:

### Project-level

Installed into `.agents/skills/` via `bunx skills add` (project mode) — the same canonical store as the committed skills, so all three harnesses see them without a second copy. Not committed — `cli/install.ts` re-fetches them on every install so we always pick up upstream fixes. They are critical to the QA stack and must travel with every clone of the repo.

The list is `PROJECT_LEVEL_SKILLS` in `cli/install.ts`; each entry carries its source package and the reason it travels with the project (the browser CLI the `[AUTOMATION_TOOL]` resolves to, the Playwright reference, the email CLI, the skill builder).

### User-level (global)

Installed with `bunx skills add <package> [--skill <name>] --global --yes` and useful across most projects regardless of stack.

The list is `USER_LEVEL_SKILLS` in `cli/install.ts`; each entry carries its source package and the reason it is universal rather than project-bound.

### Skipping or re-running

Run `INSTALL_SKIP_COMMUNITY=1 bun run setup` to skip the community step entirely. Re-runs are idempotent: already-installed skills are detected via `state.skills["community:<level>:<slug>"] === "installed"` in `.template/installer.state.json` and skipped silently.

If a skill fails to install (e.g., upstream repo restructured), the failure is recorded as `failed` in the state file and surfaced in the closing summary, but the installer continues — community skills are best-effort, not blocking.

---

## Multi-harness layout: one source, three consumers

The installer configures whichever of **Claude Code, OpenCode, and Codex** you selected in Phase 1, but it never duplicates content to do it. There is exactly one copy of every instruction and every skill; where the harnesses genuinely differ (MCP file format, hook API, how a skill is invoked) each keeps a thin versioned adapter.

The agents you select are recorded in `.agents/project.yaml` as `harnesses:` (added to what is already there, never removed), and the installer then offers to delete the files of each harness you left out; the default keeps them. Every compatibility gate (`agents:compat:check`, `setup:doctor`, the installer itself, `bun run up`) checks only the harnesses in that list, so a team on one harness keeps only that harness's files. With `harnesses:` absent or `null` the gates detect the harnesses from the files present. The boilerplate repo itself always checks all three. Decision and details: ADR-0012, `.agents/instructions/agent-harnesses.md`.

| Surface | Claude Code | OpenCode | Codex CLI + Desktop |
|---------|-------------|----------|---------------------|
| **Instructions** | `CLAUDE.md` → `@AGENTS.md` **[generated shim]** | `AGENTS.md` (native) | `AGENTS.md` (native) |
| **Skills** | `.claude/skills` **[generated alias]** | `.agents/skills/` (native) | `.agents/skills/` (native) |
| **Commands** | none: `/<skill> <mode>` through `.claude/skills` | none: name the skill and the mode in prose | none: name the skill and the mode in prose |
| **Hook** | `.claude/settings.json` → `UserPromptSubmit` + `SessionStart` (`compact`, `clear`) | `.opencode/plugins/personality-reinject.js` | `.codex/hooks.json` → `UserPromptSubmit` + `SessionStart` (`compact`, `clear`) |
| **MCP** | `.mcp.json` | `opencode.jsonc` | `.codex/config.toml` |

- **Instructions.** `AGENTS.md` plus the section files it routes to under `.agents/instructions/` are the only instruction body: `AGENTS.md` loads every session, a section when its ROUTER row or a hook `ROUTE:` line names it (`.agents/instructions/README.md`). OpenCode and Codex load `AGENTS.md` natively; Claude Code loads `CLAUDE.md`, which is exactly `@AGENTS.md` plus one newline. A documented import rather than a symlink, so it survives a Windows checkout.
- **Skills.** Every committed skill lives in `.agents/skills/`, and the community project-level skills install into the same store. Claude Code reaches that tree through `.claude/skills`, a POSIX symlink (Windows junction) that is generated and gitignored: never committed, never hand-edited.
- **Commands.** No harness gets command files. A skill is invoked by its own name plus a mode: `/<skill> <mode>` on Claude Code, the skill and the mode named in prose on OpenCode and Codex (see [Invoking a skill mode](#invoking-a-skill-mode)).
- **Hook.** `.agents/hooks/personality-reinject.mjs` holds the contract text once. Claude and Codex run it as a command hook; OpenCode imports the constant from a thin plugin.
- **MCP.** The canonical server set is whatever `.mcp.json` declares (web search and Postman run at harness level, see `cli/lib/harness-level-mcps.ts`); every server there must exist in the other configs in use, and with no Claude Code the canonical set is the first declared harness's file. Parity is checked semantically: each native format is normalized before comparison and matched on the `.env` variables each server depends on and on its literal settings, so a server missing from one host, or present in one host only, is a failure. The boilerplate-known ids (`KNOWN_MCP_IDS` in `cli/lib/agent-compatibility-contracts.ts`) additionally get a strict per-host shape check when the project declares them; any other server gets the generic check only, so a downstream project may add or drop servers freely. A local server that needs `.env` values starts through the same `.env` loader on all three hosts, and its `--filter` list is the dependency set compared; nothing beside the loader takes names from the host (an ERROR in the boilerplate, a WARNING downstream that names the exact launch, because the three MCP configs are never overwritten by a sync). The opt-in Atlassian MCP block for all three hosts, and the parity contract in full, live in `.agents/skills/agentic-qa-core/references/mcp-atlassian-optin.md`.

### Regenerating and verifying

Bold `[generated]` cells above are output. Edit the source, then regenerate:

| Generated artifact | Its source | Regenerate |
|--------------------|------------|------------|
| `CLAUDE.md` (one-line `@AGENTS.md` shim) | `AGENTS.md` | `bun run agents:compat` |
| `.claude/skills` (POSIX symlink / Windows junction) | `.agents/skills/` | `bun run agents:compat` |

A project that needs its own slash commands keeps them as plain harness command files (`.claude/commands/`, `.opencode/commands/`) and edits them by hand; nothing generates them and `bun run up` never overwrites them. The old overlay `.agents/compatibility/command-aliases.project.json` is inert: nothing reads it, and `bun run up` names it once in an informational row. One rule applies: a command named like a repo skill (say `.claude/commands/sprint-testing.md`) would hide the skill's instructions, so `agents:compat:check` fails on it and `bun run agents:compat` moves it to `.backups/shadowing-commands/<same path>`, gitignored and recoverable.

You rarely run either command by hand. `bun run setup` and `bun run up` both call the same repair internally (`repairRepositoryCompatibility` in `cli/install.ts`, and `repairAgentSurfaces` from the compatibility hook in `cli/update-boilerplate.ts`): they create or fix the alias, move aside any project command named like a skill, and then re-verify, so a clean install and a routine update both leave the contract satisfied without a manual step.

`bun run agents:compat:check` validates the whole contract for the harnesses in use (a `Harnesses checked:` line, one `NOTE:` per skipped harness): shim bytes, alias target, no project command named like a skill, hook adapters, MCP parity. It runs inside `bun run repo:check`, in the pre-push hook, and conditionally in pre-commit. The alias status line is printed on every run (created, OK, deferred until the migration commit, missing) and the errors are grouped per surface (instructions, alias, commands, hooks, MCP, lint). `bun run setup:doctor` reports the same surfaces (server count derived from `.mcp.json`, `errors_by_surface` and `alias` in `--json`) plus **Codex repository trust**, which is runtime state no file read can verify: project `.codex/` config and hooks load only in a repository you have marked trusted.

### Updating a project created before the multi-harness move

A project scaffolded when instructions lived in `CLAUDE.md` and skills in `.claude/skills/` gets a one-time migration the first time it runs `bun run up`. It happens **before** any component is synced, because the sync alone would be destructive: `CLAUDE.md` is a generated file whose upstream copy is now the one-line shim, and `AGENTS.md` is on the never-synced watchlist, so a plain sync would replace the project's AI memory with a pointer to a file that does not exist.

The migration moves the project's memory from `CLAUDE.md` to `AGENTS.md` and leaves `CLAUDE.md` as the shim; moves every skill under `.claude/skills/` into `.agents/skills/`, project-authored ones included; and archives (never overwrites) any legacy skill whose name the canonical store already owns. Nothing is deleted: what is not moved is preserved under `.template/pre-agents-migration/` (gitignored). The pass is idempotent, and if a single item cannot be resolved without guessing it refuses in full, before touching anything, rather than applying halfway.

After that one update, the project works in Claude Code, OpenCode and Codex from the same source. See [**Una fuente, tres harnesses**](https://upex-galaxy.github.io/agentic-qa-boilerplate/harnesses.es.html) for the full picture.

### What every `bun run up` reports

The run ends with a single "Estado por superficie" table: one row per surface, with an ok or warn glyph. Below it comes ONE parity prompt, printed and saved to `.agents/prompts/parity-plan.md` (gitignored, single-use; `--dry-run` prints it and does not save it). Each row of the prompt names a surface, a file and concrete evidence: headings added, removed or changed in a watched file plus hunk counts, a server declared in `.mcp.json` but missing from a host, a skill archived under `.template/pre-agents-migration/` because of a name collision, a component held back, an env key that drifted. The prompt tells the AI to present that table and WAIT for a decision per row (`keep project | take upstream | merge`) before editing, then apply only the chosen rows and run tests, types and lint.

Two flags and one watchlist shape that report. `--strict` exits 1 when the run ends with a blocking parity finding (a broken compat contract: alias, a command shadowing a skill, hooks, MCP), for CI; without it the run warns and exits 0, and drift on a protected file never blocks. `.claude/settings.json`, `.codex/` and the husky hooks are delivered once when the project lacks them (bootstrap-only) and otherwise sit on the protected watchlist (`PROTECTED_WATCHLIST` in `cli/update-boilerplate.ts`: `AGENTS.md`, `.mcp.json` and the rest): the updater never overwrites them, so project permissions, servers and hook edits survive (the `permissions.allow` and `permissions.deny` lists of `.claude/settings.json` only grow: upstream entries the project lacks are appended, a deny the project does not want is declined in `updater.declined_denies`; `opencode.jsonc` gets a paste row for the deny rules it lacks instead of a write; the files of a harness left out of `harnesses:` leave the watchlist and are never delivered, and a leftover `.envrc` gets one informational row saying it can be deleted), and any drift from upstream appears as a prompt row (a stale hook command is still caught by `agents:compat:check`). Every row is one path: a watched file that also breaks a compat contract is one blocking row with both pieces of evidence. A run that applies nothing leaves the tree byte-identical (`git status` clean, the lock untouched). An aborted run, whatever the cause (dirty tree, corrupt lock, failed clone, declined migration or self-update, a linked worktree), ends with `Abortado.` and exit 1 rather than a success line. The updater runs in the primary checkout only: its backups, markers and prompts live inside the checkout, and in a worktree they would be deleted with it.

One more thing on the migration run itself: the `.claude/skills` alias is NOT created in that invocation. The migration unindexes the committed `.claude/skills/*` tree, and git refuses to rewrite index entries behind a symlink, so an alias created right away would break `lint-staged` on the very commit that records the migration. The run prints the next step and repeats it in the closing box: commit the migration, then `bun run agents:compat` creates the alias. The compat check treats the missing alias as expected while that commit is pending (a re-run before it keeps deferring); every other contract is still enforced.

### What the updater guarantees

Behaviour by area; the release history behind it is recorded in `.context/ADR/ADR-0006-forensic-measurements-ledger.md`.

- **Never a destructive default.** `take upstream` is suggested only where the project lacks the content entirely. A row naming project-only servers, keys, headings or edits suggests `merge`; an `opencode.jsonc` holding project servers reads "only here: ... declare them in `.mcp.json` and `.codex/config.toml`, or remove them", still blocking, never "take upstream". Every `merge` on a watched file says what to port and what to keep (`port upstream additions only: <keys>; keep project-only key(s): <keys>`; `keep project` when only the project has extra keys; `take upstream` only when upstream added keys and nothing else differs).
- **`--dry-run` previews with the new updater.** When upstream carries a newer `cli/`, the preview does not write it: the fetched updater runs from the upstream clone against the project (same flags, same cwd) and shows its migration plan, component preview and parity table. Nothing is written and the prompt is not saved. Without a terminal on stdin and no `--auto` / `--interactive`, the run assumes `--auto` and prints one notice instead of hanging.
- **Post-sync gates.** After the apply, the project's own copies of the gate scripts `GATE_SCRIPTS` in `cli/update-boilerplate.ts` names run (each under a timeout; a gate that does not finish is skipped with a note; a script that does not exist is skipped; `--no-gates` disables them). A failure becomes a "Verificación" row with the exit code, the first error lines and which of the failing files this run applied, plus a `Gates:` line in the closing box. Informational only: never an abort, never blocking under `--strict`.
- **`package.json` rows and overwritten edits.** Every key kept at the project's value while upstream differs is one `package.json` row, with both values in the saved file. A synced file the project had edited (3-way against the lock cursor) and the run overwrote gets a `merge` row naming its `.backups/` copy and the hunk count.
- **Re-run safety.** The run records what it wrote in `.template/last-apply.json` (gitignored, sha256 per path). The next dirty-tree guard exempts a recorded path whose hash still matches, so `bun run up --auto` twice in a row, without committing in between, proceeds as a no-op. An unrelated dirty synced path, or a synced file edited by hand since, still aborts, naming `Commit sugerido` and the prompt path.
- **Converging rows for project-customized synced files.** `.husky/pre-commit`, `.husky/pre-push` and `.husky/commit-msg` are on the protected watchlist (project gates live there): delivered once when missing, never overwritten, one drift row per upstream change with the hunks as evidence. The rest of `.husky/` (the `_/` helpers) keeps syncing.
- **`updater.protected_paths`.** A project lists any other synced file it merged by hand under `updater:` in `.agents/project.yaml` (repo-relative file paths, empty by default, documented in `.agents/README.md`). Listed paths join the watchlist at runtime with the same semantics. A path outside the repo, under `.git`, a directory or a non-string is reported at the start of the run and ignored. The row for an overwritten project edit ends with `add the path to updater.protected_paths in .agents/project.yaml so the next sync keeps your merge`, and the saved prompt repeats it under the row as the YAML to paste.
- **Identity files compare structure only.** `.agents/project.yaml` and `.agents/jira-required.yaml` (bootstrap-only, project-owned) fire an `informational` row listing the keys upstream added, and no row at all when only values differ.
- **Host-agnostic `cli/**`.** `cli/updater-host-types.test.ts` compiles `cli/**` with a required `NODE_ENV` on `ProcessEnv` on every `bun test`, so the synced tests never break under a host that augments `ProcessEnv`.
- **`UPEX_TEMPLATE_REPO`.** Points the updater at a fork (`OWNER/REPO`, via `gh`) or a local clone (absolute path or `file://`, via `git`, no `gh` session), which is how an unpublished branch is tested against a consumer.

- **Self-update cursor without the env signal.** When the parent re-execs the child with no signal that `cli/` was just written at upstream HEAD, the re-exec child checks for itself: it compares every file the self-update component owns against upstream by blob SHA and settles the cursor there when they all match, same effect as the env signal.
- **Punctuation-insensitive heading comparison.** The parity report's markdown heading diff normalizes separators before comparing: `## Setup — Config` and `## Setup: Config` read as the same heading instead of firing a spurious added/removed pair. Whitespace is collapsed too, so a stray double space never causes a false mismatch.
- **Skills registry regenerated after parity.** `REGISTRY.md` rebuilds after the parity hook runs, not before, so it reflects `.agents/skills/` as every hook left it, parity included. A skill row reporting a project edit overwritten ends with `run bun run skills:registry`, since the registry the sync just wrote was built from the upstream content the overwrite applied, not the project's edit. The KATA manifest hook keeps its own place ahead of the gates.
- **Silently seeded watched files.** A watched file with no marker yet, whose upstream copy provably has not changed since the project's own lock cursor, is seeded silently too, same treatment as a freshly declared `updater.protected_paths` path but for a different reason: first-run noise on a migrated repo, or a project running per-file marker tracking for the first time, not a new upstream change to review.
- **`Gates: omitidas (...)` line.** A run that skips the gates entirely (`--no-gates`, or nothing applied) says so in the closing box instead of dropping the `Gates:` line: `Gates: omitidas (--no-gates)` or `Gates: omitidas (sin cambios)`.

- **Guard scope.** The dirty-tree guard blocks only on uncommitted work the sync would overwrite: a synced component file, an ignore file, `package.json`, a deprecated file. Dirt anywhere else (`tests/`, KATA code, a protected or bootstrap-only file) is listed as `N ruta(s) con cambios sin commitear fuera de lo que este updater escribe; no bloquean` and never aborts `--auto`.
- **No overwritten-edit row for a path upstream added after the lock cursor.** A file with no base copy at the cursor cannot be told apart from one that arrived another way ; unknown is never reported as an edit.
- **`.context/PBI/` still tracked in git.** One Componentes row (`N tracked path(s) still in git ...; migration recipe saved to .agents/prompts/pbi-cache-migration.md`); the recipe (tag, `git rm --cached`, commit, resync, push-to-Jira pass) lives in that gitignored file, never in the terminal. `--dry-run` shows the row without writing the file.
- **A freshly protected path gets no residual row.** A path just declared in `updater.protected_paths` has its upstream marker seeded silently (one `sin fila esta vez` note); its drift row fires on the next upstream change.
- **The `cli` lock cursor advances after a self-update.** The parent hands the sha it refreshed `cli/` to through `UPEX_UPDATER_SELF_UPDATED`; the re-exec child, which finds nothing left to sync there, settles the component at that sha instead of leaving `cli@<scaffold sha>` in the lock.
- **MCP registries are compared per server.** `.mcp.json`, `opencode.jsonc` and `.codex/config.toml` rows name the server and the fields that differ (`context7: args differ`, `supabase: env keys differ`), the first few servers named, the rest counted, instead of `same keys and values` when only a nested field changed.

---

## What stays local (committed in this repo)

Skills that are workflow-specific to this boilerplate live in `.agents/skills/` and are committed to the repo. They install with the clone — no external installer required. All three harnesses read that one directory (§ Multi-harness layout above).

The catalogue is `.agents/skills/REGISTRY.md` (generated by `bun run skills:registry`: one row per committed skill with its trigger and purpose); `.agents/instructions/agent-skills-and-mcps.md` carries the same table for the agent.

These skills evolve with the repo and are versioned in git. The split is intentional: Engram owns persistent memory; this repo owns the **vertical** workflow (specific to the IQL stages) plus a small set of vendored helpers (`judgment-day`).

### Invoking a skill mode

There are no command files: a skill is invoked by its own name plus a mode. When the first token of `$ARGUMENTS` matches one of the skill's modes, that token is the mode and the rest is forwarded to it; with no match, the skill asks. On Claude Code that is `/<skill> <mode>` through `.claude/skills`, for example `/project-context data`. On OpenCode and Codex, name the skill and the mode in prose ("load `project-context`, mode `data`").

Each multi-mode skill lists its modes in its `## Mode routing` section, and `.agents/skills/REGISTRY.md` lists the skills. Project-owned commands are covered under Regenerating and verifying above.

---

## Keeping the framework up to date — `.template/boilerplate.lock.json`

After the first time you run `bun run up`, the CLI creates `.template/boilerplate.lock.json` at the project root. This file tracks the last upstream-template git SHA for each synced component (`.agents/skills/`, `.agents/hooks/`, `.codex/`, `scripts/`, `cli/`, `.husky/`, etc.). It is safe, and recommended, to **commit this file**: your team and CI workflows need it to know which template version each component is on. Subsequent `bun run up` runs read the stored SHAs to compute precise per-file deltas, so only genuinely changed files are surfaced. What each run reports, which files are protected, and the flags (`--strict`, `--no-gates`, `--dry-run` with the new updater, `updater.protected_paths`) are described under [What every `bun run up` reports](#what-every-bun-run-up-reports) and in the README section [Keeping your project in sync](README.md#keeping-your-project-in-sync-with-the-boilerplate).

**Requirement**: `git ≥ 2.25` must be on your `$PATH` (required for sparse-checkout with `--filter=blob:none`). Run `git --version` to check; upgrade instructions are printed by the CLI if the version is too old.

---

## External CLIs (verified, not auto-installed)

The installer's step `11-verify-clis` (`verifyExternalClis`) runs a PATH probe — `which <binary>` on POSIX, `where <binary>` on Windows — for the command-line tools that other parts of the QA workflow depend on. This is a **presence-only** check: no version compare, no auto-install. If any are missing, the installer **prints the suggested install command and the official docs URL — but does not run anything**. System-level CLIs touch user permissions (Homebrew taps, apt, curl piped into bash, winget) and are not portable cross-platform, so auto-installing them without consent would be invasive. The user installs them manually following the docs URL.

The list is `EXTERNAL_CLIS` in `cli/install.ts`; each entry carries what it powers in this repo, a cross-platform install hint when one exists and the official docs URL, and the installer prints that same table.

> **Important — `playwright-cli` is NOT `@playwright/test`**: this is the agent-driven browser CLI from the `@playwright/cli` npm package, installed **globally**. It produces a binary literally named `playwright-cli` (not `playwright`). The `@playwright/test` library that ships as a devDependency in this repo is a separate thing — it powers the test runner (`bun run test`), not the `/playwright-cli` skill. Don't confuse them.

> **Why verify and not install?** Auto-installing system-level binaries from a project script would require asking for sudo/admin, picking a package manager per OS, and trusting that the user wants those tools in `$PATH` permanently. Verify-and-direct-to-docs is the polite alternative: you see what's missing, you read the official docs, you decide.

---

## Hand-off matrix — `/shift-left-testing` vs `/sprint-testing` vs `/test-automation` vs `/framework-development`

This is the most common point of confusion.

| When                                                                    | Skill                                     |
| ----------------------------------------------------------------------- | ----------------------------------------- |
| Pre-sprint AC refinement on a batch of backlog Stories (Shift-Left)    | `/shift-left-testing` (batch-grooming)    |
| Routine in-sprint QA on a Jira ticket (most cases)                      | `/sprint-testing` (ticket-driven)         |
| Authoring an automated test for a Candidate TC                          | `/test-automation` (Plan → Code → Review) |
| Refactor of the boilerplate itself — KATA bases, fixtures, cli, scripts | `/framework-development`                  |

### When to reach for `/shift-left-testing`

Pre-sprint, BEFORE the Story enters a sprint. The team grooms a batch of N backlog Stories (`Backlog` / `Shift-Left QA` / `Estimation` / `Ready For Dev` status) and wants QA to refine ACs, surface gaps + ambiguities + edge cases, and draft an ATP outline so PO + Dev lead can estimate cleanly. No execution — feature does not exist yet. Output: refined ACs in Jira, pre-sprint ATP (outline maturity) authored into the `{{jira.acceptance_test_plan}}` field (the Test Plan item is created later by `/sprint-testing` Planning), batch report to PO/Dev lead, transition `backlog → shift_left_qa → estimation`. Once each Story later reaches `Ready For QA`, `/sprint-testing` Planning short-circuits its Phases 1-3 (label `shift-left-reviewed` detected within the freshness window the skill declares).

Example: "groom UPEX-100, 101, 102, 103 before next sprint planning." Stories are in `Backlog`, ACs are sparse, you want a single batch session that produces refined ACs + PO/Dev question set + ATP outlines per Story.

### When to reach for `/sprint-testing`

The default choice for normal sprint QA. You have a ready-for-QA Jira ticket, AC is reasonably clear, the change is bounded (one feature, one bug fix, one regression). You want the standard cycle: plan, execute trifuerza (UI/API/DB) exploration, run smoke + regression, file ATP/ATR + bug reports, transition the ticket. Nothing about the QA work requires multi-phase architectural design — a clear test plan is enough.

Example: "Test UPEX-277 — empty states on the user-list filter." Ticket is `Ready For QA`, AC is 3 bullets, scope is one component plus one API. `/sprint-testing` drives the whole thing.

### When to reach for `/framework-development`

The right choice when the change is to the boilerplate's own infrastructure (KATA layers, fixtures, installer, OpenAPI sync pipeline, skill doctrine), not to a per-ticket test. Examples: "add a new `{ admin }` fixture", "refactor the OpenAPI sync to support v3.1 schemas", "modify `UiBase` to support shared selectors". This is internal QA infrastructure, not test authoring.

`/framework-development` ships self-contained: Phase 0 (path self-check) → Phase 1 Plan (single subagent writes `.session/framework-development/<change>/plan.md`) → Phase 2 Code (sequential per task batch) → Phase 3 Verify (the parallel verifiers the skill lists) → Phase 4 Archive (inline). It needs nothing outside the repo.

---

## Troubleshooting

- **`jira:sync-fields` / `jira:sync-workflows` skipped with "not an Administrator"** — your authenticated Jira user does not have `ADMINISTER` (global) or `ADMINISTER_PROJECTS` (project-scoped) permission. The scripts pre-flight `/rest/api/3/mypermissions` to avoid mid-run 403s. The installer records `state.postInstall.jiraSync* = "skipped-no-admin"` and exits step `13-jira-sync` cleanly — repo stays usable (any missing catalog gets an empty `{}` placeholder, see below). Two recovery paths: (a) ask a Jira admin to run the scripts and commit the resulting `.agents/jira-*.json` to the team repo; (b) re-run `bun run setup --force-step 13-jira-sync` and pick the **UPEX-Galaxy standard** source — or run `bun run jira:sync-fields --upex && bun run jira:sync-workflows --upex` directly to pull the UPEX-standard catalog from `upex-galaxy/agentic-qa-boilerplate@main` (no admin, no Jira API calls — just a GitHub raw fetch).
- **Pre-push rejected — `lint:skills` STALE-PATH: `.agents/jira-fields.json` / `jira-workflows.json` does not exist on disk** — the bootstrap scaffolder prunes those two catalogs from a fresh project, and a no-admin / skipped Jira sync left the SKILL.md-referenced paths dangling. Setup writes an empty `{}` placeholder for any missing catalog (step `13-jira-sync`), so a fresh `bun run setup` self-heals this. If you hit it on a project set up before that step existed, just create the files: `echo '{}' > .agents/jira-fields.json` and the same for `jira-workflows.json` (then optionally `bun run jira:sync-fields` to populate). The `{}` form is valid JSON, satisfies the lint, and is treated as "unpopulated" so a later sync fills it without `--force`.
- **`--upex` flag** — every `jira:sync-*` script (`fields`, `workflows`, `link-types`) accepts `--upex` to download the UPEX-standard reference JSON from the upstream boilerplate repo. URL is hardcoded per script and pinned to `main`. Bypasses ATLASSIAN_* env vars, `project_key`, `jira-required.yaml` and all Jira REST calls; only network requirement is GitHub raw access. Useful when (a) you have no Jira admin, (b) you want a working catalog without setting up auth, or (c) you want to compare against the canonical UPEX standard before custom-syncing.
- **engram not detected after install** — re-run `bun run setup`. The detector probes `which engram` plus `engram version`; if the binary is missing the installer falls back to the "skip Engram" branch. Confirm the binary is on PATH (`which engram` should return a path under `/usr/local/bin/`, `~/bin/`, `~/go/bin/`, or a Homebrew prefix).
- **`brew install` says `Refusing to load formula ... from untrusted tap`** — run `brew trust gentleman-programming/tap` first, then repeat the install.
- **`mem_search` finds nothing you know was saved** — search is lexical: retry with two or three keywords from the memory's title, or with `match_mode: "any"`.
- **MCPs returning 401/403** — the matching env var in `.env` is unset or wrong. All three MCP configs (`.mcp.json`, `opencode.jsonc`, `.codex/config.toml`) are committed with variable names only; real values live in `.env`. Open `.env`, fill the var, and **restart the agent session** — the `.env` loader reads it once, at MCP-server spawn time. See `AGENTS.md` Critical Rule #10.
- **MCPs not loading at all** — confirm `bun install` ran (the `.env` loader is the `varlock` devDependency, run through `bunx -p`) and `.env` exists at the project root; for Codex, also that the repository is trusted. A value that fails the schema stops only the server whose `--filter` names it (`bunx varlock load --agent` names it, redacted). `bun run setup:doctor` also reports any plaintext MCP credential copy still on disk; `bun run harness:env` retires it.
- **Codex ignores `.codex/config.toml` and the hook never fires** — the repository is not marked trusted. Codex loads project `.codex/` config and hooks only in a trusted repo, and that is runtime state no file check can see. `bun run setup:doctor` reports it on its own line; approve trust in Codex, then restart the session.
- **The skill slash or the `.claude/skills` alias stopped working after an edit** — you probably hand-edited or replaced the `.claude/skills` alias. Fix the source instead (`.agents/skills/`), then run `bun run agents:compat`, which recreates the alias. Verify with `bun run agents:compat:check`.
- **A project command vanished into `.backups/shadowing-commands/`**: it had the name of a repo skill and would have hidden that skill's instructions, so `bun run agents:compat` moved it aside. Port anything worth keeping into the skill (or give the command another name), then drop the backup.
- **Skills not appearing in autocomplete** — restart Claude Code (or your agent of choice). MCP and skill configs are cached at agent startup. On Claude Code specifically, also confirm the `.claude/skills` alias exists; if a checkout dropped it, `bun run agents:compat` recreates it.
- **`/agentic-qa-onboard` does not trigger on natural language** — use the explicit slash command: `/agentic-qa-onboard`. The natural-language triggers (`onboard me to QA`, `primer vez en QA`) are advisory, not guaranteed.
- **How do I remove Engram from an agent?** — remove the `engram` MCP server from that agent's config (on Claude Code: `claude mcp remove engram`; on Claude Code also `claude plugin uninstall engram@engram` if you added the plugin). Your memories stay in `~/.engram` until you delete that directory.
- **I installed Engram through gentle-ai earlier** — that install also wrote gentle-ai's own instructions, agents and hooks into your user-level agent config. The repo does not need them; remove them with gentle-ai's own uninstall if they get in the way, then run `bun run setup --force-step 8-skills-gentle-ai` to wire Engram directly.

---

## How to opt out

If you prefer not to use Engram, answer "No" when the installer offers the install commands, or run it with `INSTALL_SKIP_ENGRAM=1`. The installer then wires no memory and still configures the MCP servers `.mcp.json` declares.

What you lose:

- **Persistent memory (Engram)** — no cross-session recall, no `mem_save` / `mem_search`. Each session starts blind.

What you keep: every skill committed in this repo and every MCP server `.mcp.json` declares. The Atlassian MCP is opt-in: `.agents/skills/agentic-qa-core/references/mcp-atlassian-optin.md` has the block for each host. The repo is fully usable without Engram — the integration is additive.

---

## See also

- [AGENTS.md](./AGENTS.md) — the always-on instruction layer every harness loads; its ROUTER names the sections under `.agents/instructions/`, and `agent-harnesses.md` (§4.5) covers the multi-harness contract
- [CONTEXT.md](./CONTEXT.md) — context-engineering strategy and the surface-by-harness map
- [.agents/skills/agentic-qa-onboard/SKILL.md](./.agents/skills/agentic-qa-onboard/SKILL.md) — the orientation skill itself, entry point for `/agentic-qa-onboard`
- `bun run docs` — the human documentation site (`docs/`); its Setup section covers [Jira and Xray](./docs/core/setup/jira-xray.html), [DBHub](./docs/core/setup/dbhub.html) and [OpenAPI](./docs/core/setup/openapi.html)
- `docs/` ownership — `docs/README.md` says which paths `bun run up` syncs; any other folder under `docs/` is yours and the updater never writes it

---

> **You are here**: What `bun run setup` configures. **Next**: `bun run setup:doctor` to verify, or [`README.md`](README.md) to navigate.
