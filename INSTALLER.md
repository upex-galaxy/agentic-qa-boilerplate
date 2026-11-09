# The installer — what `bun setup` configures

> **Audience**: QA engineers cloning `agentic-qa-boilerplate` for the first time, or anyone wanting to understand what `bun setup` configures (Engram memory, community skills, MCPs, local skills) and what is optional.
> This document is the **contract that `cli/install.ts` implements**. The four layers of the workstation — Engram persistent memory (wired per agent with `engram setup`), community skills via `bunx skills`, locally committed workflow skills (including the vendored `judgment-day`), and the MCP servers `.mcp.json` declares — are documented below in that order.

---

## Install flow

`bun setup` runs in named phases. On a terminal with a screen it opens a local page (127.0.0.1, a per-run token in the address) that shows the phases as a timeline, explains each step, and asks every question as a card; the terminal keeps printing the whole log. `bun setup --headless` keeps everything in the terminal. Where the page opens and where it does not is under [Where the run is shown](#where-the-run-is-shown) below. The phase list is the header comment of `cli/install.ts`, and `bun setup --help` lists the flags.

The installer is **idempotent**: every step stamps `.template/installer.state.json` the moment it ends, so a re-run skips completed steps and an interrupted run resumes where it stopped.

### Preflight

Before any question and any write, `cli/preflight.ts` (Node built-ins only, so it works on a clone with no `node_modules`) checks everything knowable in seconds: the tools, at least one AI agent, the project folder, the network hosts the downloads need, free disk, the template copy and the `.env` permissions. Each row is ok, info, a warning or a block. A block stops the run before anything is written (the page offers "check again"); a warning is shown and the run goes on. `bun setup` runs the gate part first (`package.json` `setup`): when Bun is too old it stops, and when the dependencies are missing it runs `bun install` itself. After a clear or warned checklist the installer asks once whether to start. The full list of rows and which ones block is [Before you run setup](#before-you-run-setup--prerequisites) below.

### Team

Which AI agents this project works with: **Claude Code, OpenCode, Codex, Pi**. Every harness is always offered, with what was found on this machine marked, because a teammate may use one you do not have; Pi (slug `pi`) is preselected only when it is detected. The selection is recorded in `.agents/project.yaml` as `harnesses:` (see [Multi-harness layout](#multi-harness-layout-one-source-every-harness)), and for each harness left out the installer offers to delete its files (default keep).

Codex Desktop needs no separate entry: it consumes the same repository configuration as the CLI, so a repo that carries `.codex/config.toml` is already a valid Codex target even with no CLI installed. A Dock launch has no process environment, so each MCP server in that file starts through a `.env` loader: the desktop app needs `bun install` (for `varlock`) and a filled `.env` at the project root. A worktree the Codex app creates copies `.env` through the committed `.worktreeinclude` and then runs `bun run worktree:provision` (dependencies, git hooks, the rest of the gitignored inputs) through the committed `.codex/environments/environment.toml`.

Team also asks what the Install phase needs, so the downloads can start without waiting for anyone: which user-level skills to install (one checkbox per skill, see [User-level (global)](#user-level-global)) and, on Claude Code, whether to add the Engram plugin.

### Install (in the background)

Starts as soon as Team is answered and runs in a background lane ("in the background" in the page) while the next phases ask their questions:

- `bun install`, if the gate did not already run it
- `bun run pw:install`: the Chromium browser for Playwright
- `engram setup <agent>`: wires Engram persistent memory into each selected agent (one call per agent), see [What `engram setup` adds](#what-engram-setup-adds) below
- `bunx skills add`: project-level skills (`PROJECT_LEVEL_SKILLS` in `cli/install.ts`) and the user-level skills you kept (`USER_LEVEL_SKILLS`)
- the agent compatibility repair (the `.claude/skills` alias, project commands named like a skill moved aside)

There are no questions inside this phase. The output of each program streams into its step's log lines.

### Project

Fills `.agents/project.yaml`: project identity, the Jira site, the environments and the default one. This is `agents:setup` absorbed into the run: the page (or the terminal) asks, and `agents-setup --non-interactive` writes. The example of each field is shown as a hint, never written as a value.

### Credentials

- Where secret values live: `.env` is the default and comes first. The step also offers a secret manager as the ADVANCED option (adapters live in `cli/lib/secret-providers.ts`). Choosing it records `secrets:` in `.agents/project.yaml` and writes `.env.provider.schema` once (references only, committed; never overwritten), then shows the one-time setup. See "Secret manager (advanced)" below.
- `.env` population: discovers the variables each MCP server needs from the MCP config of every selected harness (the `.env` loader's `--filter` list, the same in `.mcp.json`, `opencode.jsonc`, `.codex/config.toml` and `.pi/mcp.json`; a legacy `${VAR}` / `{file:}` / `env_vars` / `bearer_token_env_var` reference is still read), then asks for the values not already set. A value already set in the shell that runs `bun setup` is never copied into `.env` by itself: an interactive run asks per variable, naming where it comes from, and an unattended one copies nothing and lists the names. A secret is a masked field; its value goes to `.env` (created with mode 600) and never into the page, the log or the saved summary. "Later" is a valid answer for every one of them.
- Day-0 Atlassian credentials (`ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN`), and the API login only when its credentials exist and the API answers.

After filling `.env`, restart the agent session (MCP servers read `.env` through the `.env` loader when the harness spawns them).

### Jira

- `acli` session: runs `acli jira auth login` with the token piped on stdin and `--site` from `bun run jira:url --slug`. Without `acli` on PATH the step is skipped (the preflight already warned) and the closing report says how to sign in later.
- **Jira catalogs**: one question picks the catalog source for the whole project, then syncs custom fields and workflow statuses/transitions accordingly:
  - **My own Jira workspace**: checks the credentials first (a rejected token shows a card that says what happened and takes a new one), then `jira:sync-fields --force` + `jira:sync-workflows --force`. **Requires Jira `Administer` permission** (global or project-scoped); without it the scripts exit 0 and the step records `state.postInstall.jiraSync* = "skipped-no-admin"`. The status and transition pickers of `jira:sync-workflows` are answered in the same run: the installer calls it with `--plan-json` (prints what is unresolved, writes nothing), asks each mapping as a card, and applies with `--answers <file>`.
  - **UPEX-Galaxy standard**: `jira:sync-fields --upex --force` + `jira:sync-workflows --upex --force` + `jira:sync-link-types --upex`, downloading the reference catalogs from `upex-galaxy/agentic-qa-boilerplate@main` (no admin, no Jira API, just GitHub raw). It is the recommended option when the Atlassian site, email or token is missing.
  - **Skip**: leaves the catalogs unconfigured.

  Whatever the choice, the installer then writes an empty `{}` placeholder for any of `.agents/jira-fields.json` / `jira-workflows.json` / `jira-link-types.json` still missing on disk. This guarantees the SKILL.md-referenced paths exist, so the `lint-skills` STALE-PATH check never fails `repo:check` / the pre-push hook on a freshly bootstrapped project. The `{}` form is treated as "unpopulated": a later `bun run jira:sync-*` fills it without `--force`, and `bun run vars:check` reads it as not synced yet (one warning, no error), so the first commit's hook passes.
- **Sprint Board statuses**: right after the catalogs, when a workflow catalog was synced, one question offers the suggested `board.statuses` buckets for every status no bucket lists yet, then `board.jql` (by default the project key's open-sprint stories). Buckets left empty are written as `[]`. The block is written only when `bun run board:check` would accept it, so a missing key or Atlassian site leaves the yaml as it was. Declined or skipped: `bun run agents:setup` asks the same later.
- `jira:check`: validates `.agents/jira-required.yaml` against the workspace. Skipped when the sync was no-admin / skipped (the comparison would be against the UPEX catalog or empty placeholders, not the user's workspace).

Set `INSTALL_SKIP_JIRA=1` to skip the whole phase (use only for non-Jira projects). The Jira steps record their outcome under `state.postInstall`; a re-run of `bun setup` asks again for whatever is not `completed`.

### Sprint Board (optional)

The Sprint Board (`bun run board:up`) reads the `board:` block of `.agents/project.yaml`. Untouched (every status bucket `null`), `bun run board:check` prints one INFO line and passes. Once a bucket is filled it validates the whole block and names each key still to fill: `board.jql` for a Jira source, a ticket key (`project.project_key`, or `board.ticket_key_pattern`), `issue_tracker.atlassian_url`, and every workflow status in exactly one bucket. `bug_jql`, `people`, `timezone` and `brand` are optional. `bun setup` (after the catalog sync) and `bun run agents:setup` fill the buckets and the query for you; the comments beside each key in the yaml say the rest.

> **Link types**: `jira:sync-link-types` is auto-invoked only when you pick the **UPEX-Galaxy standard** source above (it downloads `.agents/jira-link-types.json --upex`). For the **own-workspace** source, refresh it by hand: `bun run jira:sync-link-types` (or `--upex` for the UPEX standard). USER-OK (no admin needed for either path).

### GitHub

Optional: creates the repository with `gh` and pushes, or hydrates `state.github` from an existing remote. It waits for the Install lane, and the push is confirmed with `git ls-remote`.

### Verify and done

The external CLI table (information only, see [External CLIs](#external-clis-verified-not-auto-installed)), the state file, and the retirement of plaintext MCP credential copies an older `bun run harness:env` generated (the `env` block of `.claude/settings.local.json`, `.auth/opencode/<VAR>`): a copy equal to `.env` is deleted, a copy `.env` does not reproduce is moved to `.auth/harness-env-backup/<VAR>` (mode 0600) and named so you put the right value in `.env` and delete the directory, and a copy a legacy host config still reads is kept. `bun run harness:env` does the same on its own (`--check` exits 1 while a stale copy remains, `--dry-run` changes nothing); `bun setup --variables` regenerates nothing.

The run ends with **one report**: what was done, skipped or failed, and the next steps (open your agent, `/agentic-qa-onboard`, `/project-discovery`, and whatever is still pending, each with its command).

### Git strategy setup (agent-driven, before you rely on a push policy)

The scaffold ships a **default** git strategy (`solo-main`) with `strategy_source: inherited` in `.agents/project.yaml` — a placeholder nobody chose for YOUR project. Defining it is an explicit step, not an inherited fact: once your project identity is filled in, ask your AI agent:

> **"set up our git strategy"**

That runs git-flow-master's Strategy Setup: it resolves your branching flow (solo-main / main-integration / sdet / others), asks the merge + hotfix + protection-policy questions, materializes any long-lived branches, and writes the `git_strategy:` block with `strategy_source: chosen`. Until you do this, the agent offers it on your first git intent, and the synced `pre-push` hook (`bun run git:policy verify`) prints any difference between the inherited policy and the host as warnings that point here, and lets the push through. No origin yet, or one that is not GitHub, is a warning too. Once the strategy is `chosen`, unaccepted drift blocks the push.

### Where the run is shown

`bun setup` and `bun sync` decide once, at start, whether the run opens the page (`cli/lib/ui/env-detect.ts`, first match wins):

| Condition | Where the run is shown |
|---|---|
| `--headless` | terminal only, questions in the terminal |
| `--ui` | the page, even where the rows below say terminal (SSH with a tunnel, a terminal an agent drives while a person watches) |
| `CI`, `GITHUB_ACTIONS` or `BUILD_ID` set | terminal |
| stdin or stdout is not a terminal | terminal |
| an AI agent is the caller (Claude Code, Codex, OpenCode, Pi) | terminal |
| SSH without a display | terminal, with a one-line hint about `--ui` and a tunnel |
| Linux without `DISPLAY` / `WAYLAND_DISPLAY` (WSL without WSLg too) | terminal |
| otherwise | the page |

- Inside Orca the page opens as a browser tab bound to the worktree; elsewhere in the system browser. The address is always printed in the terminal.
- The terminal always shows the full log; only the questions move to the page. If no page connects within 10 seconds, the questions go back to the terminal for the rest of the run.
- The page speaks Spanish or English, from `LC_ALL` / `LC_MESSAGES` / `LANG` (Spanish when unsure).
- When a page run ends, a static copy of it is saved under `.session/runs/` (gitignored; the oldest copies are pruned) and the open page shows its path. No secret value reaches the page, the log or that copy.
- `bun sync --auto`, typed by a person on a real terminal, opens a read-only page: no question cards, the deferred items listed in the report. An `--auto` implied by "no terminal" never opens it.

The page code lives in `cli/lib/ui/` and is byte-identical in this repo and agentic-dev-boilerplate; `scripts/shared-files.json` lists the shared files and `bun run shared:check` (part of `repo:check`) fails when one drifts.

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

The step keys are the ones `.template/installer.state.json` records under `steps` (they keep their earlier names, such as `5-deps-install` or `8-skills-gentle-ai`, so older state files still gate a re-run). The preflight and the verification steps always re-run, since they probe live state. The Project and Jira steps (`agents:setup`, `acli` auth, `jira:sync-fields`, `jira:sync-workflows`, `jira:check`) track their status under `state.postInstall.*` rather than `state.steps`.

---

## Before you run setup — prerequisites

The installer is self-diagnosing: the preflight shows every row with the exact command or URL that fixes it, before anything is written. You will still iterate faster if you front-load the blockers below. For the same checklist with brief tables, see the top of [`README.md`](./README.md#prerequisites).

### What the preflight checks

The rows, their thresholds and their messages live in `runSetupPreflight` in `cli/preflight.ts`. `bun cli/preflight.ts --for setup --json` prints the same checklist as JSON (exit 0 clear, 1 warnings, 2 something blocks), for CI and agents.

| Blocks the run (nothing is written until it is fixed) | Warns and goes on |
| --- | --- |
| **Bun** older than the floor `cli/preflight.ts` enforces, or missing | **acli** missing: the Jira phase is skipped and the report says how to sign in later |
| **`node`** (the real binary) missing: the agent hooks run `node .agents/hooks/personality-reinject.mjs` | **engram** missing or too old: memory is not wired; install it and re-run `bun setup` |
| **`git`** missing | git identity (`user.email`) unset: only the GitHub phase needs it |
| **No AI agent**: none of Claude Code (`~/.claude/` or `claude` on PATH), OpenCode (`~/.config/opencode/` or `opencode` on PATH), Codex (`codex` on PATH, or `.codex/config.toml` in the repo), Pi (`~/.pi/agent/` or `pi` on PATH) | `gh` missing or not signed in: only the GitHub phase needs it |
| No `package.json` in the folder: run `bun setup` from the project root | a project without the boilerplate's marker (fine when the scaffolder made it); the 1Password CLI, when you pick 1Password |
| Free disk below the block threshold | free disk below the warning threshold |
| A download host that does not answer while its download is still pending (`registry.npmjs.org`, `github.com`, `cdn.playwright.dev`) | the Atlassian site of `.agents/project.yaml` does not answer; on Linux, the one `sudo bunx playwright install-deps chromium` command the Chromium system libraries need (the installer never asks for sudo mid-run) |

Three more rows are information only: Python 3.9+ with Pillow (only the evidence pages need it; the row names the Pillow command for your platform), a `.agents/project.yaml` that is still the boilerplate's own copy (it is reseeded from the template before anything writes to it), and a `.env` readable by others (its mode is fixed to 600 on the spot).

The agent row is the gotcha that bites first-timers most often: a missing `gh` or `acli` only warns, but zero detected agents blocks. Install at least one of Claude Code, OpenCode, Codex, or Pi first, then run `bun setup`.

Before the installer even loads, the `--gate` part (the first half of `package.json` `setup`) checks Bun and the dependencies, and runs `bun install` itself when `node_modules` is missing. The scaffolder needs `git` and `tar` on PATH as well (`packages/create-agentic-qa/src/runners.ts`, `download.ts`).

### Windows

PowerShell and cmd are supported directly — WSL and Git Bash work too, but neither is required. Two Windows-specific notes:

- **Install Bun with `powershell -c "irm bun.sh/install.ps1 | iex"`**, not `npm i -g bun`. The npm route writes only a `bun.cmd` shim (no `bun.exe`), which the scaffolder has to launch through `cmd.exe`.
- **`tar` needs no extra install.** Windows 10 1803+ and Windows 11 ship bsdtar at `C:\Windows\System32\tar.exe`, and the scaffolder builds a tar command line that both bsdtar and GNU tar accept.

Under WSL, keep the project on the Linux filesystem (`~/projects/...`). On a `/mnt/c` path Bun cannot create its bin shims and `bun install` fails with `could not open bin metadata file`.

### Engram

Install it before `bun setup` if you want persistent memory from the first session: Homebrew on macOS / Linux (`brew trust gentleman-programming/tap && brew install gentleman-programming/tap/engram`), or any OS with Go (`go install github.com/Gentleman-Programming/engram/v3/cmd/engram@latest`). The minimum version is `MIN_ENGRAM_VERSION` in `cli/install.ts`. Homebrew refuses formulas from a tap it does not trust, which is why the tap is trusted first. Upgrade later with `brew upgrade engram`.

Missing or too old, Engram is a preflight warning and the run goes on without it. Persistent memory is then NOT wired (no cross-session memory); the committed skills keep working, and the MCP servers `.mcp.json` declares are still configured. Install it later and run `bun setup` again: it only does what is missing.

### Per-skill CLIs — lazy-required, non-blocking at setup

These CLIs are **not optional** for the workflow — each one is consumed by a specific skill, and its `EXTERNAL_CLIS` entry in `cli/install.ts` names which. The installer cannot guess which skills you will run, so it ships them as **lazy-required**: a missing binary surfaces as a row of the verification table but never blocks setup. Install them up front if you plan to use the whole stack, or on-demand when the owning skill surfaces a missing-binary error.

The check itself is a **PATH probe** (`which <name>` on POSIX, `where <name>` on Windows — see `verifyExternalClis` in `cli/install.ts`). Presence only — no version compare, no auto-install.

The verification step (`verifyExternalClis`) iterates the `EXTERNAL_CLIS` array in `cli/install.ts` and shows a per-CLI status table (illustrative output):

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

Orca (`orca`) is the one entry a skill cannot run without: `/sprint-conductor` runs only on it and stops with one line when the binary or its runtime is missing; `/orca-orchestration` and every other skill work without it (one-shot subagents stay the default executor). `bun run setup:doctor` reports its gate. `python3` (or `py` / `python` on Windows) serves only the evidence pages; `setup:doctor` checks its version and Pillow.

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
2. Run `bun setup` and pick 1Password. Team: a shared vault (`<project>-dev`). Personal plan: your own vault; it works locally, CI cannot read it.
3. In the vault, one Password item per variable, titled with the variable NAME. In `.env.provider.schema`, uncomment those lines and leave the keys empty in `.env`.
4. Check, redacted: `bunx varlock load --agent`. Bun's own `.env` autoload does not resolve the `op://` references, so a script that needs a vault secret runs through `bunx varlock run -- <cmd>`.
5. CI (team plan): a service account with read access to the vault; its token is the GitHub secret `OP_SERVICE_ACCOUNT_TOKEN`, beside the per-variable secrets (never instead).

Non-interactive: `INSTALL_SECRETS_PROVIDER=1password INSTALL_SECRETS_VAULT=<vault> bun setup --non-interactive`. Other managers varlock supports plug into the same slot (`cli/lib/secret-providers.ts`); none ships configured.

### Where to verify your status

| Command                            | What it does                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `bun run setup:doctor --preflight` | The setup gate (alias of `bun cli/preflight.ts --for setup --gate`): Bun recent enough and the dependencies present, running `bun install` when they are missing |
| `bun cli/preflight.ts --for setup --json` | The whole preflight checklist as JSON: exit 0 clear, 1 warnings, 2 something blocks |
| `bun run setup:doctor`             | Full report: env vars, deps, Playwright browsers, MCP config files for the harnesses in use (`harnesses:`), plaintext MCP credential copies an older version left, pending actions with `where` URLs |
| `bun run setup:doctor --json`      | Same as above as machine-readable JSON for an agent to consume                                                       |
| `bun setup`                    | Re-run the installer end-to-end (idempotent: completed steps are skipped, a re-run asks only what is still pending) |

---

## Running setup from an AI agent

Most users ask an AI (Claude Code, OpenCode, Codex, Pi, …) to drive the setup instead of running it by hand. The installer is built for both flows; the AI path uses a few specific entry points:

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

### `bun setup --non-interactive` (or just `bun setup` without a TTY)

The installer auto-detects no-TTY (an agent invoking it without a terminal) and switches to `--non-interactive`; an agent shell never opens the page (see [Where the run is shown](#where-the-run-is-shown)). Every question takes its default answer, and the Jira phase is skipped (nobody can type the credentials). The closing report starts with `Ask your human for these N keys` (names only, never values): the human writes them to `.env` (never through the chat), then restarts the agent session. Same data the doctor exposes. Use this path when the AI wants to run the full setup batch:

```bash
INSTALL_AGENTS=claude-code,opencode,codex bun setup --non-interactive
```

The slugs are `claude-code`, `opencode`, `codex` and `pi` (`INSTALL_AGENTS=claude-code,pi`).

The command carries no secret: the human fills the credentials afterwards in `.env` or the secret manager (Critical Rule #1). Then `bun run setup:doctor --json` to confirm.

### Skip flags (per-step opt-out)

| Env var                       | Effect                           |
| ----------------------------- | -------------------------------- |
| `INSTALL_SKIP_ENGRAM=1`       | Treat Engram as skipped (legacy alias: `INSTALL_SKIP_GENTLE_AI=1`) |
| `INSTALL_SKIP_DEPS=1`         | Skip `bun install`               |
| `INSTALL_SKIP_PLAYWRIGHT=1`   | Skip `bun run pw:install`        |
| `INSTALL_SKIP_AGENTS_SETUP=1` | Skip the Project phase (`agents:setup`) |
| `INSTALL_SKIP_COMMUNITY=1`    | Skip `bunx skills add` step      |
| `INSTALL_SKIP_JIRA=1`         | Skip the Jira phase              |
| `INSTALL_SKIP_API=1`          | Skip optional API auth bootstrap |
| `INSTALL_SECRETS_PROVIDER=1password` | Opt in to the secret manager (default `.env`); pair with `INSTALL_SECRETS_VAULT=<vault>` |

### Force flags (re-run completed steps)

| Flag / Env var                 | Effect                                        |
| ------------------------------ | --------------------------------------------- |
| `--force`                      | Clear all step timestamps — re-run everything |
| `--force-step <key>`           | Re-run one step by key                        |
| `INSTALL_FORCE_ALL=1`          | Same as `--force`                             |
| `INSTALL_FORCE_ENGRAM=1`       | Re-run `engram setup` (legacy alias: `INSTALL_FORCE_GENTLE_AI=1`) |
| `INSTALL_FORCE_COMMUNITY=1`    | Re-run community skill install (declined user-level skills stay out) |
| `INSTALL_FORCE_GITHUB=1`       | Re-run GitHub remote setup                    |
| `INSTALL_FORCE_AGENTS_SETUP=1` | Re-run agents:setup                           |

---

## Launching the agent after setup

`.env` is the default source of credentials (a secret manager can hold them instead, see "Secret manager (advanced)"), and no harness gets a copy of it. Every MCP server that needs `.env` values starts through the same `.env` loader in `.mcp.json`, `opencode.jsonc`, `.codex/config.toml` and `.pi/mcp.json` (`varlock run`, run through `bunx -p` from the project devDep), so each server reads `.env` itself, and only its own variables, even on a bare or Dock launch. `bun run setup:doctor` reports any plaintext copy an older `bun run harness:env` left behind, and `bun run harness:env` retires it. After filling `.env`, restart the agent session (MCP servers read `.env` when the harness spawns them). `bun setup` closes with the commands below in its report. Nothing needs `.env` exported into your shell: the Bun scripts (`bun run jira:*`, `bun run api:login`, `bun xray`) read it through Bun's own autoload, `acli` uses its stored login (`acli jira auth login`) and `gh` its keyring.

Open the harness from the repo root, on Windows, macOS or Linux alike: `claude`, `opencode`, `codex` or `pi`, or the desktop app (Claude Desktop, Codex Desktop, OpenCode desktop) on the project folder. Pi is opened bare, `pi`, never inside a loader. No wrapper and no one-time setup beyond `bun install` (the `.env` loader is the `varlock` devDependency).

Every MCP config is committed with variable NAMES only: every server that needs `.env` values launches as `bunx -p varlock@<pin> varlock run --no-redact-stdout --inject vars --filter A,B -- <server>`, the same on every host. The loader reads the varlock schema plus `.env` / `.env.local` (or the secret manager the schema names) from the project root at spawn time and hands the server only the names in its `--filter`; `--no-redact-stdout` keeps the JSON-RPC stream intact. Real values live in `.env` (gitignored), and no plaintext copy is written anywhere. If a server returns 401/403 at first call, the matching env var is missing — see `AGENTS.md` Critical Rule #10 (stop, fix `.env`, restart the agent session).

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

`bun setup` runs one call per selected agent:

```bash
engram setup claude-code --protocol=slim
engram setup opencode
engram setup codex
```

`engram setup` does not name Pi, so for Pi the installer prints the line to run yourself: `pi mcp add engram --exposure deferred -- engram mcp --tools=agent`. It prints it on every run with a Pi agent, a re-run that finds Engram already wired included, because the installer cannot tell whether you ran it.

Each call registers the `engram` MCP server for that agent (on Claude Code through `claude mcp add`, into the user config). `--protocol=slim` keeps Claude Code's session-start protocol short and writes no block into your instructions file.

On Claude Code, the session hooks (such as the memory context injected at session start) come from the Engram plugin, which the MCP registration does not install. The installer asks once, in the Team phase next to the agent choice, whether to add it (default yes), and installs it right after `engram setup claude-code` succeeds. It never runs in non-interactive mode, and a declined or failed install only shows the commands, so you can add it yourself once per machine:

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

Installed into `.agents/skills/` via `bunx skills add` (project mode) — the same canonical store as the committed skills, so every harness sees them without a second copy. Not committed — `cli/install.ts` re-fetches them on every install so we always pick up upstream fixes. They are critical to the QA stack and must travel with every clone of the repo.

The list is `PROJECT_LEVEL_SKILLS` in `cli/install.ts`; each entry carries its source package and the reason it travels with the project (the browser CLI the `[AUTOMATION_TOOL]` resolves to, the Playwright reference, the email CLI, the skill builder).

### User-level (global)

Installed with `bunx skills add <package> [--skill <name>] --global --yes` and useful across most projects regardless of stack.

The list is `USER_LEVEL_SKILLS` in `cli/install.ts`; each entry carries its source package and the reason it is universal rather than project-bound.

The installer asks per skill, in the Team phase: one checkbox per skill, every one pre-checked. A skill you uncheck is recorded as `declined` in the state file and is not offered again, not even when `INSTALL_FORCE_COMMUNITY=1` or `--sync-skills` forces a re-run; the question names the skills declined earlier and the `bunx skills add` line to install one by hand. A non-interactive run installs every skill you have not declined.

### Skipping or re-running

Run `INSTALL_SKIP_COMMUNITY=1 bun setup` to skip the community step entirely. Re-runs are idempotent: already-installed skills are detected via `state.skills["community:<level>:<slug>"] === "installed"` in `.template/installer.state.json` and skipped silently.

If a skill fails to install (e.g., upstream repo restructured), the failure is recorded as `failed` in the state file and surfaced in the closing report, but the installer continues — community skills are best-effort, not blocking.

---

## Multi-harness layout: one source, every harness

The installer configures whichever of **Claude Code, OpenCode, Codex, and Pi** you selected in the Team phase, but it never duplicates content to do it. There is exactly one copy of every instruction and every skill; where the harnesses genuinely differ (MCP file format, hook API, how a skill is invoked) each keeps a thin versioned adapter.

The agents you select are recorded in `.agents/project.yaml` as `harnesses:` (added to what is already there, never removed), and the installer then offers to delete the files of each harness you left out; the default keeps them. Every compatibility gate (`agents:compat:check`, `setup:doctor`, the installer itself, `bun sync`) checks only the harnesses in that list, so a team on one harness keeps only that harness's files. With `harnesses:` absent or `null` the gates detect the harnesses from the files present. The boilerplate repo itself always checks every harness. An existing project gets no Pi file unless it declares Pi or the Pi files already exist, and the template keeps `harnesses: null`. Decision and details: ADR-0012, `.agents/instructions/agent-harnesses.md`.

| Surface | Claude Code | OpenCode | Codex CLI + Desktop | Pi |
|---------|-------------|----------|---------------------|----|
| **Instructions** | `CLAUDE.md` → `@AGENTS.md` **[generated shim]** | `AGENTS.md` (native) | `AGENTS.md` (native) | `AGENTS.md` (native) |
| **Skills** | `.claude/skills` **[generated alias]** | `.agents/skills/` (native) | `.agents/skills/` (native) | `.agents/skills/` (native) |
| **Commands** | none: `/<skill> <mode>` through `.claude/skills` | none: name the skill and the mode in prose | none: name the skill and the mode in prose | none: `/skill:<name> <mode>` |
| **Hook** | `.claude/settings.json` → `UserPromptSubmit` + `SessionStart` (`compact`, `clear`) + `PostToolUse` (doc contracts) | `.opencode/plugins/personality-reinject.js` | `.codex/hooks.json` → `UserPromptSubmit` + `SessionStart` (`compact`, `clear`) + `PostToolUse` (doc contracts) | `.pi/extensions/agentic-qa.js` |
| **MCP** | `.mcp.json` | `opencode.jsonc` | `.codex/config.toml` | `.pi/mcp.json` |

- **Instructions.** `AGENTS.md` plus the section files it routes to under `.agents/instructions/` are the only instruction body: `AGENTS.md` loads every session, a section when its ROUTER row or a hook `ROUTE:` line names it (`.agents/instructions/README.md`). OpenCode, Codex and Pi load `AGENTS.md` natively; Claude Code loads `CLAUDE.md`, which is exactly `@AGENTS.md` plus one newline. A documented import rather than a symlink, so it survives a Windows checkout.
- **Skills.** Every committed skill lives in `.agents/skills/`, and the community project-level skills install into the same store. Claude Code reaches that tree through `.claude/skills`, a POSIX symlink (Windows junction) that is generated and gitignored: never committed, never hand-edited.
- **Commands.** No harness gets command files. A skill is invoked by its own name plus a mode: `/<skill> <mode>` on Claude Code, the skill and the mode named in prose on OpenCode and Codex, `/skill:<name> <mode>` on Pi (see [Invoking a skill mode](#invoking-a-skill-mode)).
- **Hook.** `.agents/hooks/personality-reinject.mjs` holds the contract text once. Claude and Codex run it as a command hook; OpenCode imports the constant from a thin plugin; Pi runs one plain-JS extension, `.pi/extensions/agentic-qa.js`, over the same emitter. `.agents/hooks/doc-contracts.mjs` is the boilerplate maintainers' edit-time reminder of the documentation contracts (ADR-0016): registered as a `PostToolUse` hook, it stays silent in your project.
- **MCP.** The canonical server set is whatever `.mcp.json` declares (web search and Postman run at harness level, see `cli/lib/harness-level-mcps.ts`); every server there must exist in the other configs in use, and with no Claude Code the canonical set is the first declared harness's file. Parity is checked semantically: each native format is normalized before comparison and matched on the `.env` variables each server depends on and on its literal settings, so a server missing from one host, or present in one host only, is a failure. The boilerplate-known ids (`KNOWN_MCP_IDS` in `cli/lib/agent-compatibility-contracts.ts`) additionally get a strict per-host shape check when the project declares them; any other server gets the generic check only, so a downstream project may add or drop servers freely. A local server that needs `.env` values starts through the same `.env` loader on every host, and its `--filter` list is the dependency set compared; nothing beside the loader takes names from the host (an ERROR in the boilerplate, a WARNING downstream that names the exact launch, because the MCP configs are never overwritten by a sync). The opt-in Atlassian MCP block for each host, and the parity contract in full, live in `.agents/skills/agentic-qa-core/references/mcp-atlassian-optin.md`.
- **Pi.** Two files: `.pi/mcp.json` (the MCP registry, same `mcpServers` shape as `.mcp.json`, the same `.env` loader lines, each server with `exposure: "deferred"` and a one-line `description`) and `.pi/extensions/agentic-qa.js` (one plain-JS adapter over the shared emitter). Detection reads those two files only; everything else under `.pi/` is runtime state, gitignored by an allowlist. User-level MCP servers live in `~/.pi/agent/mcp.json` (`pi mcp add`); claude.ai connectors do not exist on Pi. **Project trust:** without it a session gets `AGENTS.md` and nothing else (no skills, no MCP, no adapter). Run `/trust` inside Pi; `bun run setup:doctor` reports trust apart from file correctness, and a machine that runs workers trusts the parent folder. **Seatbelt, not a wall:** Pi has no deny config and no approval system, so bypass is its only state. The adapter refuses direct reads of `.env*` (not `.env.example` or the schemas), `.auth/**`, `.claude/settings.local.json` and the `printenv`-style commands, but shell variants such as `cat .env` pass, `pi-subagents` background children are untested, and it exists only where the adapter loads (an untrusted session, or a print or RPC session under `ask`, has none). Pi ships no subagents, question tool or plan mode: work runs inline or on a supervised worker, and questions use the numbered-list fallback. The adapter has no edit-time doc-contract hook; the pre-push gate covers it.

### Regenerating and verifying

Bold `[generated]` cells above are output. Edit the source, then regenerate:

| Generated artifact | Its source | Regenerate |
|--------------------|------------|------------|
| `CLAUDE.md` (one-line `@AGENTS.md` shim) | `AGENTS.md` | `bun run agents:compat` |
| `.claude/skills` (POSIX symlink / Windows junction) | `.agents/skills/` | `bun run agents:compat` |

A project that needs its own slash commands keeps them as plain harness command files (`.claude/commands/`, `.opencode/commands/`) and edits them by hand; nothing generates them and `bun sync` never overwrites them. The old overlay `.agents/compatibility/command-aliases.project.json` is inert: nothing reads it, and `bun sync` names it once in an informational row. One rule applies: a command named like a repo skill (say `.claude/commands/sprint-testing.md`) would hide the skill's instructions, so `agents:compat:check` fails on it and `bun run agents:compat` moves it to `.backups/shadowing-commands/<same path>`, gitignored and recoverable.

You rarely run either command by hand. `bun setup` and `bun sync` both call the same repair internally (`repairRepositoryCompatibility` in `cli/install.ts`, and `repairAgentSurfaces` from the compatibility hook in `cli/update-boilerplate.ts`): they create or fix the alias, move aside any project command named like a skill, and then re-verify, so a clean install and a routine update both leave the contract satisfied without a manual step.

`bun run agents:compat:check` validates the whole contract for the harnesses in use (a `Harnesses checked:` line, one `NOTE:` per skipped harness): shim bytes, alias target, no project command named like a skill, hook adapters, MCP parity. It runs inside `bun run repo:check`, in the pre-push hook, and conditionally in pre-commit. The alias status line is printed on every run (created, OK, deferred until the migration commit, missing) and the errors are grouped per surface (instructions, alias, commands, hooks, MCP, lint). `bun run setup:doctor` reports the same surfaces (server count derived from `.mcp.json`, `errors_by_surface` and `alias` in `--json`) plus **Codex repository trust**, which is runtime state no file read can verify: project `.codex/` config and hooks load only in a repository you have marked trusted.

### Updating a project created before the multi-harness move

A project scaffolded when instructions lived in `CLAUDE.md` and skills in `.claude/skills/` gets a one-time migration the first time it runs `bun sync`. It happens **before** any component is synced, because the sync alone would be destructive: `CLAUDE.md` is a generated file whose upstream copy is now the one-line shim, and `AGENTS.md` is on the never-synced watchlist, so a plain sync would replace the project's AI memory with a pointer to a file that does not exist.

The migration moves the project's memory from `CLAUDE.md` to `AGENTS.md` and leaves `CLAUDE.md` as the shim; moves every skill under `.claude/skills/` into `.agents/skills/`, project-authored ones included; and archives (never overwrites) any legacy skill whose name the canonical store already owns. Nothing is deleted: what is not moved is preserved under `.template/pre-agents-migration/` (gitignored). The pass is idempotent, and if a single item cannot be resolved without guessing it refuses in full, before touching anything, rather than applying halfway.

After that one update, the project works in every harness it declares from the same source. See [**Una fuente, todos los harnesses**](https://upex-galaxy.github.io/agentic-qa-boilerplate/harnesses.es.html) for the full picture.

### How a `bun sync` run goes

`bun sync` shows its run the same way `bun setup` does (see [Where the run is shown](#where-the-run-is-shown)): a local page on a terminal with a screen, the terminal flow with `--headless`, a read-only page for an explicit `--auto`. `bun sync --help` lists every flag; an unknown flag is refused instead of ignored.

- **Preflight first** (`runUpPreflight` in `cli/preflight.ts`): Bun, git recent enough for the sparse checkout, a `gh` session (or a local template clone through `UPEX_TEMPLATE_REPO`), `github.com`, the primary checkout (never a linked worktree), a readable lock file, free disk. A block stops the run before anything is written; Node missing only warns. Then the run starts without asking.
- **Self-update keeps the page.** When upstream carries a newer `cli/`, the updater restarts itself on the new code; the page shows the restart and reconnects at the same address, and nothing already answered is asked again.
- **Every question first, then one write.** The areas to update, the files of each area (every row has its diff), the files changed on both sides, the deletions and the new `package.json` keys are all answered before the first file is written; then the apply runs once. A synced file the project edited and upstream also changed asks (decide later, keep mine, take the new one) instead of being overwritten; under `--auto` it is still overwritten, with a backup in `.backups/`. A file upstream deleted is one question per file, default keep.
- **A dirty tree aborts naming the files** the run would overwrite; `--force` never asks.

### What every `bun sync` reports

The run ends with a single "Estado por superficie" table: one row per surface, with an ok or warn glyph. The page shows it in the closing report and the terminal prints it. Below it comes ONE parity prompt, shown and saved to `.agents/prompts/parity-plan.md` (gitignored, single-use; `--dry-run` prints it and does not save it). Each row of the prompt names a surface, a file and concrete evidence: headings added, removed or changed in a watched file plus hunk counts, a server declared in `.mcp.json` but missing from a host, a skill archived under `.template/pre-agents-migration/` because of a name collision, a component held back, an env key that drifted. The prompt tells the AI to present that table and WAIT for a decision per row (`keep project | take upstream | merge`) before editing, then apply only the chosen rows and run tests, types and lint.

Two flags and one watchlist shape that report. `--strict` exits 1 when the run ends with a blocking parity finding (a broken compat contract: alias, a command shadowing a skill, hooks, MCP), for CI; without it the run warns and exits 0, and drift on a protected file never blocks. `.claude/settings.json`, `.codex/` and the husky hooks are delivered once when the project lacks them (bootstrap-only) and otherwise sit on the protected watchlist (`PROTECTED_WATCHLIST` in `cli/update-boilerplate.ts`: `AGENTS.md`, `.mcp.json` and the rest): the updater never overwrites them, so project permissions, servers and hook edits survive (the `permissions.allow` and `permissions.deny` lists and the `hooks` of `.claude/settings.json` only grow: upstream entries the project lacks are appended, a missing hook command as a new group after the project's own, before the compatibility check runs, so a hook group `agents:compat:check` starts requiring never leaves the project failing its own gates; a deny the project does not want is declined in `updater.declined_denies`, a hook command in `updater.declined_hooks`; `opencode.jsonc` gets a paste row for the deny rules it lacks instead of a write; the files of a harness left out of `harnesses:` leave the watchlist and are never delivered, and a leftover `.envrc` gets one informational row saying it can be deleted), and any drift from upstream appears as a prompt row (a stale hook command is still caught by `agents:compat:check`). Every row is one path: a watched file that also breaks a compat contract is one blocking row with both pieces of evidence. A run that applies nothing leaves the tree byte-identical (`git status` clean, the lock untouched). An aborted run, whatever the cause (dirty tree, corrupt lock, failed clone, declined migration or self-update, a linked worktree), ends with `Abortado.` and exit 1 rather than a success line. The updater runs in the primary checkout only: its backups, markers and prompts live inside the checkout, and in a worktree they would be deleted with it.

One more thing on the migration run itself: the `.claude/skills` alias is NOT created in that invocation. The migration unindexes the committed `.claude/skills/*` tree, and git refuses to rewrite index entries behind a symlink, so an alias created right away would break `lint-staged` on the very commit that records the migration. The run prints the next step and repeats it in the closing box: commit the migration, then `bun run agents:compat` creates the alias. The compat check treats the missing alias as expected while that commit is pending (a re-run before it keeps deferring); every other contract is still enforced.

### What the updater guarantees

Behaviour by area; the release history behind it is recorded in `.context/ADR/ADR-0006-forensic-measurements-ledger.md`.

- **Never a destructive default.** `take upstream` is suggested only where the project lacks the content entirely. A row naming project-only servers, keys, headings or edits suggests `merge`; an `opencode.jsonc` holding project servers reads "only here: ... declare them in `.mcp.json` and `.codex/config.toml`, or remove them", still blocking, never "take upstream". Every `merge` on a watched file says what to port and what to keep (`port upstream additions only: <keys>; keep project-only key(s): <keys>`; `keep project` when only the project has extra keys; `take upstream` only when upstream added keys and nothing else differs).
- **`--dry-run` previews with the new updater.** When upstream carries a newer `cli/`, the preview does not write it: the fetched updater runs from the upstream clone against the project (same flags, same cwd) and shows its migration plan, component preview and parity table. Nothing is written and the prompt is not saved. Without a terminal on stdin and no `--auto` / `--interactive`, the run assumes `--auto` and prints one notice instead of hanging.
- **Post-sync gates.** After the apply, the project's own copies of the gate scripts `GATE_SCRIPTS` in `cli/update-boilerplate.ts` names run (each under a timeout; a gate that does not finish is skipped with a note; a script that does not exist is skipped; `--no-gates` disables them). A failure becomes a "Verificación" row with the exit code, the first error lines and which of the failing files this run applied, plus a `Gates:` line in the closing box. Informational only: never an abort, never blocking under `--strict`.
- **`package.json` rows and overwritten edits.** Every key kept at the project's value while upstream differs is one `package.json` row, with both values in the saved file. A synced file the project had edited (3-way against the lock cursor) and the run overwrote gets a `merge` row naming its `.backups/` copy and the hunk count.
- **Re-run safety.** The run records what it wrote in `.template/last-apply.json` (gitignored, sha256 per path). The next dirty-tree guard exempts a recorded path whose hash still matches, so `bun sync --auto` twice in a row, without committing in between, proceeds as a no-op. An unrelated dirty synced path, or a synced file edited by hand since, still aborts, naming `Commit sugerido` and the prompt path.
- **Converging rows for project-customized synced files.** `.husky/pre-commit`, `.husky/pre-push` and `.husky/commit-msg` are on the protected watchlist (project gates live there): delivered once when missing, never overwritten, one drift row per upstream change with the hunks as evidence. The rest of `.husky/` (the `_/` helpers) keeps syncing.
- **`updater.protected_paths`.** A project lists any other synced file it merged by hand under `updater:` in `.agents/project.yaml` (repo-relative file paths, empty by default, documented in `.agents/README.md`). Listed paths join the watchlist at runtime with the same semantics, and the `.test.*` file next to each one is held back with it while the project's copy differs from upstream's. A path outside the repo, under `.git`, a directory or a non-string is reported at the start of the run and ignored. The row for an overwritten project edit ends with `add the path to updater.protected_paths in .agents/project.yaml so the next sync keeps your merge`, and the saved prompt repeats it under the row as the YAML to paste.
- **Browser-profile rows, informational.** A `.playwright/cli.config.json` that still carries `"isolated": false` or a `userDataDir` gets one row (every session name would share one profile). A project skill, command or instruction (`.agents/skills/`, `.claude/skills/`, `.claude/commands/`, `.agents/instructions/`, `AGENTS.md`, `CLAUDE.md`) that opens a browser with `--persistent`, or with a `--profile` that is relative or inside the repo, gets one row per file naming each line. The updater never edits either; the doctrine and the cleanup command (`bun run browser:profiles`) are in `.agents/skills/agentic-qa-core/references/browser-sessions.md`.
- **Identity files compare structure only.** `.agents/project.yaml` and `.agents/jira-required.yaml` (bootstrap-only, project-owned) fire an `informational` row listing the keys upstream added, and no row at all when only values differ. A whole top-level block missing from `.agents/project.yaml` is the one write: offered on an interactive run, inserted from the template with blank values by `--auto`, never an edit to a block the project has.
- **Host-agnostic `cli/**`.** `cli/updater-host-types.test.ts` compiles `cli/**` with a required `NODE_ENV` on `ProcessEnv` on every `bun test`, so the synced tests never break under a host that augments `ProcessEnv`.
- **`UPEX_TEMPLATE_REPO`.** Points the updater at a fork (`OWNER/REPO`, via `gh`) or a local clone (absolute path or `file://`, via `git`, no `gh` session), which is how an unpublished branch is tested against a consumer.

- **Self-update cursor without the env signal.** When the parent re-execs the child with no signal that `cli/` was just written at upstream HEAD, the re-exec child checks for itself: it compares every file the self-update component owns against upstream by blob SHA and settles the cursor there when they all match, same effect as the env signal.
- **Punctuation-insensitive heading comparison.** The parity report's markdown heading diff normalizes separators before comparing: `## Setup — Config` and `## Setup: Config` read as the same heading instead of firing a spurious added/removed pair. Whitespace is collapsed too, so a stray double space never causes a false mismatch.
- **Skills registry regenerated after parity.** `REGISTRY.md` rebuilds after the parity hook runs, not before, so it reflects `.agents/skills/` as every hook left it, parity included. A skill row reporting a project edit overwritten ends with `run bun run skills:registry`, since the registry the sync just wrote was built from the upstream content the overwrite applied, not the project's edit. The KATA manifest hook keeps its own place ahead of the gates.
- **Silently seeded watched files.** A watched file with no marker yet, whose upstream copy provably has not changed since the project's own lock cursor, is seeded silently too, same treatment as a freshly declared `updater.protected_paths` path but for a different reason: first-run noise on a migrated repo, or a project running per-file marker tracking for the first time, not a new upstream change to review. A file whose BLOCKING prerequisite gate still fails is never seeded.
- **A BLOCKING prerequisite row repeats until its gate passes.** For a kept file declared in `PATH_PREREQUISITES`, the sync runs the row's gate (its arbiter) on every run; while it fails, the row is printed whatever the upstream marker says. The marker records that upstream was seen, the gate records that the project resolved it.
- **`Gates: omitidas (...)` line.** A run that skips the gates entirely (`--no-gates`, or nothing applied) says so in the closing box instead of dropping the `Gates:` line: `Gates: omitidas (--no-gates)` or `Gates: omitidas (sin cambios)`.

- **Guard scope.** The dirty-tree guard blocks only on uncommitted work the sync would overwrite: a synced component file, an ignore file, `package.json`, a deprecated file. Dirt anywhere else (`tests/` outside the synced helpers of component `tests-utils`, KATA code, a protected or bootstrap-only file) is listed as `N ruta(s) con cambios sin commitear fuera de lo que este updater escribe; no bloquean` and never aborts `--auto`.
- **No overwritten-edit row for a path upstream added after the lock cursor.** A file with no base copy at the cursor cannot be told apart from one that arrived another way ; unknown is never reported as an edit.
- **`.context/PBI/` still tracked in git.** One Componentes row (`N tracked path(s) still in git ...; migration recipe saved to .agents/prompts/pbi-cache-migration.md`); the recipe (tag, `git rm --cached`, commit, resync, push-to-Jira pass) lives in that gitignored file, never in the terminal. `--dry-run` shows the row without writing the file.
- **A freshly protected path gets no residual row.** A path just declared in `updater.protected_paths` has its upstream marker seeded silently (one `sin fila esta vez` note); its drift row fires on the next upstream change.
- **The `cli` lock cursor advances after a self-update.** The parent hands the sha it refreshed `cli/` to through `UPEX_UPDATER_SELF_UPDATED`; the re-exec child, which finds nothing left to sync there, settles the component at that sha instead of leaving `cli@<scaffold sha>` in the lock.
- **`templateCommit` reaches the upstream head.** A component with no delta at the new head has its cursor moved too, so the lock's top-level `templateCommit` advances once nothing is pending, and a re-run at the same head repairs a lock an earlier partial sync left behind. A component with a pending delta (deselected, skipped) keeps its cursor.
- **MCP registries are compared per server.** `.mcp.json`, `opencode.jsonc`, `.codex/config.toml` and `.pi/mcp.json` rows name the server and the fields that differ (`context7: args differ`, `supabase: env keys differ`), the first few servers named, the rest counted, instead of `same keys and values` when only a nested field changed.

---

## What stays local (committed in this repo)

Skills that are workflow-specific to this boilerplate live in `.agents/skills/` and are committed to the repo. They install with the clone — no external installer required. Every harness reads that one directory (§ Multi-harness layout above).

The catalogue is `.agents/skills/REGISTRY.md` (generated by `bun run skills:registry`: one row per committed skill with its trigger and purpose); `.agents/instructions/agent-skills-and-mcps.md` carries the same table for the agent.

These skills evolve with the repo and are versioned in git. The split is intentional: Engram owns persistent memory; this repo owns the **vertical** workflow (specific to the IQL stages) plus a small set of vendored helpers (`judgment-day`).

### Invoking a skill mode

There are no command files: a skill is invoked by its own name plus a mode. When the first token of `$ARGUMENTS` matches one of the skill's modes, that token is the mode and the rest is forwarded to it; with no match, the skill asks. On Claude Code that is `/<skill> <mode>` through `.claude/skills`, for example `/project-context data`. On OpenCode and Codex, name the skill and the mode in prose ("load `project-context`, mode `data`"). On Pi it is `/skill:<name> <mode>`, for example `/skill:project-context data`.

Each multi-mode skill lists its modes in its `## Mode routing` section, and `.agents/skills/REGISTRY.md` lists the skills. Project-owned commands are covered under Regenerating and verifying above.

---

## Keeping the framework up to date — `.template/boilerplate.lock.json`

After the first time you run `bun sync`, the CLI creates `.template/boilerplate.lock.json` at the project root. This file tracks the last upstream-template git SHA for each synced component (`.agents/skills/`, `.agents/hooks/`, `.codex/`, `scripts/`, `cli/`, `.husky/`, etc.). It is safe, and recommended, to **commit this file**: your team and CI workflows need it to know which template version each component is on. Subsequent `bun sync` runs read the stored SHAs to compute precise per-file deltas, so only genuinely changed files are surfaced. What each run reports, which files are protected, and the flags (`--strict`, `--no-gates`, `--dry-run` with the new updater, `updater.protected_paths`) are described under [What every `bun sync` reports](#what-every-bun-sync-reports) and in the README section [Keeping your project in sync](README.md#keeping-your-project-in-sync-with-the-boilerplate).

**Requirement**: `git ≥ 2.25` must be on your `$PATH` (required for sparse-checkout with `--filter=blob:none`). Run `git --version` to check; upgrade instructions are printed by the CLI if the version is too old.

---

## External CLIs (verified, not auto-installed)

The installer's verification step (`verifyExternalClis`) runs a PATH probe — `which <binary>` on POSIX, `where <binary>` on Windows — for the command-line tools that other parts of the QA workflow depend on. This is a **presence-only** check: no version compare, no auto-install. If any are missing, the installer **shows the suggested install command and the official docs URL — but does not run anything**. System-level CLIs touch user permissions (Homebrew taps, apt, curl piped into bash, winget) and are not portable cross-platform, so auto-installing them without consent would be invasive. The user installs them manually following the docs URL.

The list is `EXTERNAL_CLIS` in `cli/install.ts`; each entry carries what it powers in this repo, a cross-platform install hint when one exists and the official docs URL, and the installer shows that same table.

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

Pre-sprint, BEFORE the Story enters a sprint. The team grooms a batch of N backlog Stories (`Backlog` / `Shift-Left QA` / `Ready For Dev` status) and wants QA to refine ACs, surface gaps + ambiguities + edge cases, and draft an ATP outline so PO + Dev lead can judge each Story before the sprint. No execution — feature does not exist yet. Output: refined ACs in Jira, pre-sprint ATP (outline maturity) authored into the `{{jira.acceptance_test_plan}}` field (the Test Plan item is created later by `/sprint-testing` Planning), batch report to PO/Dev lead, the `AI Effort` field (Low / Medium / High: the effort of implementing AND verifying the whole Story in an agentic workflow, never a time or a token forecast; High only warns that the Story may need splitting, never blocks, and a PO may split it optionally), transition `backlog → shift_left_qa → ready_for_dev` (`refined`). Once each Story later reaches `Ready For QA`, `/sprint-testing` Planning short-circuits its Phases 1-3 (label `shift-left-reviewed` detected within the freshness window the skill declares).

Example: "groom UPEX-100, 101, 102, 103 before next sprint planning." Stories are in `Backlog`, ACs are sparse, you want a single batch session that produces refined ACs + PO/Dev question set + ATP outlines per Story.

### When to reach for `/sprint-testing`

The default choice for normal sprint QA. You have a ready-for-QA Jira ticket, AC is reasonably clear, the change is bounded (one feature, one bug fix, one regression). You want the standard cycle: plan, execute trifuerza (UI/API/DB) exploration, run smoke + regression, file ATP/ATR + bug reports, transition the ticket. Nothing about the QA work requires multi-phase architectural design — a clear test plan is enough.

Example: "Test UPEX-277 — empty states on the user-list filter." Ticket is `Ready For QA`, AC is 3 bullets, scope is one component plus one API. `/sprint-testing` drives the whole thing.

### When to reach for `/framework-development`

The right choice when the change is to the boilerplate's own infrastructure (KATA layers, fixtures, installer, OpenAPI sync pipeline, skill doctrine), not to a per-ticket test. Examples: "add a new `{ admin }` fixture", "refactor the OpenAPI sync to support v3.1 schemas", "modify `UiBase` to support shared selectors". This is internal QA infrastructure, not test authoring.

`/framework-development` ships self-contained: Phase 0 (path self-check) → Phase 1 Plan (single subagent writes `.session/framework-development/<change>/plan.md`) → Phase 2 Code (sequential per task batch) → Phase 3 Verify (the parallel verifiers the skill lists) → Phase 4 Archive (inline). It needs nothing outside the repo.

---

## Troubleshooting

- **`jira:sync-fields` / `jira:sync-workflows` skipped with "not an Administrator"** — your authenticated Jira user does not have `ADMINISTER` (global) or `ADMINISTER_PROJECTS` (project-scoped) permission. The scripts pre-flight `/rest/api/3/mypermissions` to avoid mid-run 403s. The installer records `state.postInstall.jiraSync* = "skipped-no-admin"` and ends the Jira catalogs step cleanly — repo stays usable (any missing catalog gets an empty `{}` placeholder, see below). Two recovery paths: (a) ask a Jira admin to run the scripts and commit the resulting `.agents/jira-*.json` to the team repo; (b) re-run `bun setup` (it asks the catalog source again while the sync is not `completed`) and pick the **UPEX-Galaxy standard** source — or run `bun run jira:sync-fields --upex && bun run jira:sync-workflows --upex` directly to pull the UPEX-standard catalog from `upex-galaxy/agentic-qa-boilerplate@main` (no admin, no Jira API calls — just a GitHub raw fetch).
- **Pre-push rejected — `lint:skills` STALE-PATH: `.agents/jira-fields.json` / `jira-workflows.json` does not exist on disk** — the bootstrap scaffolder prunes those two catalogs from a fresh project, and a no-admin / skipped Jira sync left the SKILL.md-referenced paths dangling. Setup writes an empty `{}` placeholder for any missing catalog (Jira phase), so a fresh `bun setup` self-heals this. If you hit it on a project set up before that step existed, just create the files: `echo '{}' > .agents/jira-fields.json` and the same for `jira-workflows.json` (then optionally `bun run jira:sync-fields` to populate). The `{}` form is valid JSON, satisfies the lint, and is treated as "unpopulated" so a later sync fills it without `--force`.
- **`--upex` flag** — every `jira:sync-*` script (`fields`, `workflows`, `link-types`) accepts `--upex` to download the UPEX-standard reference JSON from the upstream boilerplate repo. URL is hardcoded per script and pinned to `main`. Bypasses ATLASSIAN_* env vars, `project_key`, `jira-required.yaml` and all Jira REST calls; only network requirement is GitHub raw access. Useful when (a) you have no Jira admin, (b) you want a working catalog without setting up auth, or (c) you want to compare against the canonical UPEX standard before custom-syncing.
- **engram not detected after install** — re-run `bun setup`. The preflight probes `which engram` plus `engram version`; if the binary is missing it warns and the run goes on without memory. Confirm the binary is on PATH (`which engram` should return a path under `/usr/local/bin/`, `~/bin/`, `~/go/bin/`, or a Homebrew prefix).
- **`brew install` says `Refusing to load formula ... from untrusted tap`** — run `brew trust gentleman-programming/tap` first, then repeat the install.
- **`mem_search` finds nothing you know was saved** — search is lexical: retry with two or three keywords from the memory's title, or with `match_mode: "any"`.
- **MCPs returning 401/403** — the matching env var in `.env` is unset or wrong. Every MCP config (`.mcp.json`, `opencode.jsonc`, `.codex/config.toml`, `.pi/mcp.json`) is committed with variable names only; real values live in `.env`. Open `.env`, fill the var, and **restart the agent session** — the `.env` loader reads it once, at MCP-server spawn time. See `AGENTS.md` Critical Rule #10.
- **MCPs not loading at all** — confirm `bun install` ran (the `.env` loader is the `varlock` devDependency, run through `bunx -p`) and `.env` exists at the project root; for Codex, also that the repository is trusted. A value that fails the schema stops only the server whose `--filter` names it (`bunx varlock load --agent` names it, redacted). `bun run setup:doctor` also reports any plaintext MCP credential copy still on disk; `bun run harness:env` retires it.
- **Codex ignores `.codex/config.toml` and the hook never fires** — the repository is not marked trusted. Codex loads project `.codex/` config and hooks only in a trusted repo, and that is runtime state no file check can see. `bun run setup:doctor` reports it on its own line; approve trust in Codex, then restart the session.
- **The skill slash or the `.claude/skills` alias stopped working after an edit** — you probably hand-edited or replaced the `.claude/skills` alias. Fix the source instead (`.agents/skills/`), then run `bun run agents:compat`, which recreates the alias. Verify with `bun run agents:compat:check`.
- **A project command vanished into `.backups/shadowing-commands/`**: it had the name of a repo skill and would have hidden that skill's instructions, so `bun run agents:compat` moved it aside. Port anything worth keeping into the skill (or give the command another name), then drop the backup.
- **Skills not appearing in autocomplete** — restart Claude Code (or your agent of choice). MCP and skill configs are cached at agent startup. On Claude Code specifically, also confirm the `.claude/skills` alias exists; if a checkout dropped it, `bun run agents:compat` recreates it.
- **`/agentic-qa-onboard` does not trigger on natural language** — use the explicit slash command: `/agentic-qa-onboard`. The natural-language triggers (`onboard me to QA`, `primer vez en QA`) are advisory, not guaranteed.
- **How do I remove Engram from an agent?** — remove the `engram` MCP server from that agent's config (on Claude Code: `claude mcp remove engram`; on Claude Code also `claude plugin uninstall engram@engram` if you added the plugin). Your memories stay in `~/.engram` until you delete that directory.
- **I installed Engram through gentle-ai earlier** — that install also wrote gentle-ai's own instructions, agents and hooks into your user-level agent config. The repo does not need them; remove them with gentle-ai's own uninstall if they get in the way, then run `bun setup --force-step 8-skills-gentle-ai` to wire Engram directly.

---

## How to opt out

If you prefer not to use Engram, do not install the binary (the preflight only warns), or run the installer with `INSTALL_SKIP_ENGRAM=1`. The installer then wires no memory and still configures the MCP servers `.mcp.json` declares.

What you lose:

- **Persistent memory (Engram)** — no cross-session recall, no `mem_save` / `mem_search`. Each session starts blind.

What you keep: every skill committed in this repo and every MCP server `.mcp.json` declares. The Atlassian MCP is opt-in: `.agents/skills/agentic-qa-core/references/mcp-atlassian-optin.md` has the block for each host. The repo is fully usable without Engram — the integration is additive.

---

## See also

- [AGENTS.md](./AGENTS.md) — the always-on instruction layer every harness loads; its ROUTER names the sections under `.agents/instructions/`, and `agent-harnesses.md` (§4.5) covers the multi-harness contract
- [CONTEXT.md](./CONTEXT.md) — context-engineering strategy and the surface-by-harness map
- [.agents/skills/agentic-qa-onboard/SKILL.md](./.agents/skills/agentic-qa-onboard/SKILL.md) — the orientation skill itself, entry point for `/agentic-qa-onboard`
- `bun run docs` — the human documentation site (`docs/`); its Setup section covers [Jira and Xray](./docs/core/setup/jira-xray.html), [DBHub](./docs/core/setup/dbhub.html) and [OpenAPI](./docs/core/setup/openapi.html)
- `docs/` ownership — `docs/README.md` says which paths `bun sync` syncs; any other folder under `docs/` is yours and the updater never writes it

---

> **You are here**: What `bun setup` configures. **Next**: `bun run setup:doctor` to verify, or [`README.md`](README.md) to navigate.
