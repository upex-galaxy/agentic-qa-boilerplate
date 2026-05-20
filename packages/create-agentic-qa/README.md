# create-agentic-qa

Official scaffolder for the [Agentic QA](https://github.com/upex-galaxy/agentic-qa-boilerplate)
ecosystem. Downloads the boilerplate template, scrubs git history, initializes a
fresh repository, installs dependencies, and runs the interactive installer.

## Usage

```bash
bunx create-agentic-qa my-app
```

That single command:

1. Downloads `upex-galaxy/agentic-qa-boilerplate` (latest `main`) as a tarball.
2. Extracts into `./my-app/` (no git history).
3. Rewrites `package.json` name + `.agents/project.yaml` `project.name`.
4. Initializes a fresh `git init -b main` and creates the initial commit.
5. Runs `bun install`.
6. Hands off to the boilerplate's interactive installer (`bun run setup`),
   which runs `cli/doctor.ts --preflight` first, then configures gentle-ai,
   agent skills, MCPs, `.env`, and — at the end — optionally creates a GitHub
   repository for you via `gh`.

## Interactive menu

Run the CLI with no positional argument in a TTY (or pass `--menu` explicitly)
and you get an interactive launcher instead of going straight to scaffold:

```bash
bunx create-agentic-qa            # no args + TTY → menu
bunx create-agentic-qa --menu     # force menu even when args are present
```

The menu offers four options:

| Option                    | What it does                                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Create a new project**  | Prompts for a project name, sanitizes it, then runs the normal scaffold flow.                                                      |
| **Check prerequisites**   | Runs the scaffolder's `doctor` (see below) and returns to the menu.                                                                |
| **What will this install?** | Runs `inspect` (see below) — a manifest-driven tour of every skill, MCP, file and auth step the downstream installer will touch. |
| **Quit**                  | Exit without doing anything.                                                                                                       |

Suppress the ASCII banner with `--no-banner` (useful for CI or piped output).

## Doctor — pre-clone system checks

The scaffolder's doctor verifies six **universal prerequisites** before you
clone anything. This is intentionally a thin layer — the boilerplate's own
installer (`bun run setup`, invoked at the end of this CLI) has a much bigger
`cli/doctor.ts` that handles agent CLIs, gentle-ai, MCP credentials and the
per-skill binary matrix. See
[INSTALLER.md](https://github.com/upex-galaxy/agentic-qa-boilerplate/blob/main/INSTALLER.md)
for the downstream version.

| #   | Check         | Required | Why                                                       |
| --- | ------------- | -------- | --------------------------------------------------------- |
| 1   | `bun`         | yes      | Runs this CLI, `bun install`, and `bun run setup`.        |
| 2   | `git`         | yes      | `git init -b main` + initial commit (skipped on `--no-git`). |
| 3   | `node >= 18`  | yes      | Some downstream tools shell out to a Node 18+ runtime.    |
| 4   | `gh`          | optional | Needed only for `--github-create` at the end of setup.    |
| 5   | `internet`    | yes      | Reaches `api.github.com` to fetch the template tarball.   |
| 6   | `disk space`  | optional | Warns if less than 200 MB free in the current directory.  |

The doctor is reachable from the interactive menu. There is no standalone CLI
flag — if you need machine-readable output, parse the menu run or use the
downstream `bun run setup:doctor`.

## Inspect — what will the installer actually touch?

The inspect view is a read-only walkthrough driven by
`src/installer-manifest.json`. It answers "what is this thing going to do to my
machine?" before you commit to running it.

Five sections are rendered:

1. **Prerequisites** — every binary the downstream installer expects, with a
   live `present` / `MISSING` / `n/a` status next to it.
2. **Will install** — gentle-ai skills, community project-level skills, and
   community user-level skills (counts + first 5 of each, with a drill-down
   prompt to expand any category).
3. **Will configure** — MCP servers (with the `.env` keys each one reads),
   `.env` files written or updated, authentication services, and the
   non-interactive vs interactive post-install steps.
4. **Will NOT install** — services and CLIs you handle yourself, each with a
   one-line docs pointer.
5. **Drill-down** — pick any of the three skill categories to print its full
   list; loop back into the inspect view until you choose "Back to menu".

Inspect is purely informational — it does not write to disk, hit the network
beyond a binary probe, or modify any project state.

## In-repo mode

If you already cloned `agentic-qa-boilerplate` manually, you can run the CLI
inside that folder:

```bash
cd existing-clone
bunx create-agentic-qa --here
```

The CLI detects the `.template/installer.lock.json` sentinel, skips the download
stage entirely, and jumps straight to the installer.

## What you get

A ready-to-use QA project wired for:

- **Playwright + KATA + TypeScript** test architecture (Layer 1-4 fixtures).
- **Skills-based AI workflows** — invoke `/agentic-qa-onboard` for a tour,
  `/project-discovery` to reverse-engineer your target app, `/adapt-framework`
  to wire KATA fixtures to your stack, `/shift-left-testing` for pre-sprint
  AC refinement on backlog Stories, and `/sprint-testing` for per-ticket
  in-sprint manual QA.
- **MCPs preconfigured** for Playwright, OpenAPI, Atlassian (Jira/Xray),
  DBHub, Context7, and Tavily.
- **Allure + Xray reporting** — pre-wired Allure reporter and `bun xray` CLI
  for syncing automated runs back to your test management system.

## Flags

| Flag                           | Default                              | Description                                                                                                           |
| ------------------------------ | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `<project-name>`               | (required)                           | Target directory name. Required unless `--here` is passed or you are in a TTY (menu will prompt).                     |
| `--here`                       | off                                  | Bootstrap into the current directory; or, if already inside a bootstrapped project, skip download and run setup only. |
| `--template <ref>`             | `main`                               | Branch / tag / SHA of the template repo to download.                                                                  |
| `--template-repo <owner/repo>` | `upex-galaxy/agentic-qa-boilerplate` | Override the upstream repository (useful for forks).                                                                  |
| `--project-key <KEY>`          | (prompted)                           | Jira project key (e.g. `UPEX`). Optional — leave blank to fill in later.                                              |
| `--no-install`                 | off                                  | Skip `bun install`.                                                                                                   |
| `--no-setup`                   | off                                  | Skip `bun run setup` — only download + git init.                                                                      |
| `--no-git`                     | off                                  | Skip `git init` + initial commit.                                                                                     |
| `--non-interactive`            | auto on no-TTY                       | Forwarded to the installer. Prompts use safe defaults.                                                                |
| `--menu`                       | off                                  | Force the interactive menu even when a project name is provided.                                                      |
| `--no-banner`                  | off                                  | Suppress the ASCII banner (useful for CI / piped output).                                                             |
| `--help`, `-h`                 |                                      | Print help and exit.                                                                                                  |
| `--version`, `-v`              |                                      | Print CLI version and exit.                                                                                           |

## Examples

```bash
# Standard scaffold
bunx create-agentic-qa my-app

# Scaffold with the Jira project key pre-filled
bunx create-agentic-qa my-app --project-key ACME

# Bootstrap into the current directory (or resume setup inside an existing clone)
bunx create-agentic-qa --here

# Use a fork of the template
bunx create-agentic-qa my-app --template-repo my-fork/agentic-qa-boilerplate

# Pin to a specific tag or SHA
bunx create-agentic-qa my-app --template v0.5.0

# Open the interactive menu even though arguments are provided
bunx create-agentic-qa my-app --menu

# CI-friendly: no banner, no prompts
bunx create-agentic-qa my-app --no-banner --non-interactive

# Download only — skip install and setup
bunx create-agentic-qa my-app --no-install --no-setup
```

## Requirements

The scaffolder itself needs only a small set of CLIs. The downstream installer
(`bun run setup`) — which this scaffolder invokes by default — has a larger
prerequisite list. Both are documented here so you do not get stopped mid-flow.

### For the scaffolder itself (this CLI)

| Tool  | Min version | Required for                                                            | Where it is checked                                          |
| ----- | ----------- | ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| `bun` | `>= 1.0.0`  | Running `bun install` + handing off to `bun run setup`                  | `src/runners.ts` (`ensureBunAvailable`) — exit 10 if missing |
| `tar` | any         | Extracting the template tarball                                         | `src/download.ts` — exit 10 if missing                       |
| `git` | any         | `git init -b main` + initial commit (skipped with `--no-git`)           | `src/runners.ts` (`ensureGitAvailable`) — exit 10 if missing |
| `gh`  | any         | _Optional_ — creating a GitHub repository at the end of `bun run setup` | Verified inside the boilerplate installer, not by this CLI   |

### For `bun run setup` (the boilerplate's interactive installer this CLI hands off to)

Hand-off happens unless you pass `--no-setup`. The boilerplate installer
enforces these additional preconditions:

| Tool                                                            | Min version | Why                                                                                                                                                                                                                                                                                                                                                                                               | Behavior on miss                                                                                                                                                                                             |
| --------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Agent CLI** — Claude Code **or** OpenCode                     | latest      | Step 4 detects `~/.claude/` or `~/.config/opencode/`. Skills + MCPs install into the chosen agent.                                                                                                                                                                                                                                                                                                | **Hard exit 1** with both docs URLs. Install [Claude Code](https://docs.claude.com/en/docs/claude-code) or [OpenCode](https://opencode.ai/docs) before re-running.                                           |
| **gentle-ai**                                                   | `>= 1.26.5` | Installs 13 universal skills (Engram persistent memory + 10 SDD-\* + skill-registry + judgment-day + issue-creation).                                                                                                                                                                                                                                                                             | Warns + offers two install commands and the [docs URL](https://github.com/Gentleman-Programming/gentle-ai); you can continue without it or exit and install.                                                 |
| Per-skill CLIs — `gh`, `acli`, `playwright-cli`, `resend`, `jq` | latest      | Each one is **required by a specific skill**, not optional for the workflow (`gh` → `/git-flow-master` + `/regression-testing`; `acli` → `/acli` + `/sprint-testing` + `/test-documentation`; `playwright-cli` → `/playwright-cli`; `resend` → `/resend-cli`; `jq` → `acli ... --json \| jq ...` pipelines). Installer cannot guess which skills you will run, so they ship as **lazy-required**. | Non-blocking — Step 10 prints a status table with `quick:` install commands (where cross-platform) and `docs:` URL per missing CLI. Install on-demand when the owning skill surfaces a missing-binary error. |
| Convenience opt-in — `direnv`                                   | latest      | Pure UX. Auto-loads `.env` so the bare `claude` / `opencode` binaries see MCP credentials. The `bun run claude` / `bun run opencode` wrappers (already a project devDep) do the same cross-platform with zero setup.                                                                                                                                                                              | Non-blocking. Safe to decline — recommended on Windows (PowerShell support is experimental in direnv 2.37+).                                                                                                 |
| MCP credentials — 8 `.env` keys                                 | —           | Wires the 7 canonical MCPs (Tavily, Atlassian, OpenAPI, Postman). `.mcp.json` / `opencode.jsonc` are committed with `${VAR}` placeholders.                                                                                                                                                                                                                                                        | Non-blocking — `bun run setup:doctor` lists pending vars with `where` URLs (token-generation pages) until you fill them.                                                                                     |

The scaffolder prints actionable install hints up front for its own
requirements (`bun`, `tar`, `git`). For the boilerplate-side preconditions
above, see the unified [Prerequisites](https://github.com/upex-galaxy/agentic-qa-boilerplate#prerequisites)
section in the parent README and the more detailed
[INSTALLER.md → Before you run setup](https://github.com/upex-galaxy/agentic-qa-boilerplate/blob/main/INSTALLER.md#before-you-run-setup--prerequisites)
contract.

## Exit codes

| Code | Meaning                                                          |
| ---- | ---------------------------------------------------------------- |
| 0    | Success                                                          |
| 2    | Usage error (missing name, conflicting flags)                    |
| 10   | Environment error (no bun / no tar / no git)                     |
| 11   | Network error (template download failed)                         |
| 12   | Target directory already exists and is not an agentic-qa project |
| 20   | Bootstrap error (extract / scrub / git init failed)              |
| 30   | `bun install` failed                                             |
| 31   | `bun run setup` failed                                           |
| 130  | User cancelled (Ctrl+C)                                          |

## Troubleshooting

**The menu opens when I just want to scaffold.**
Pass a project name as the first positional argument:
`bunx create-agentic-qa my-app`. The menu only opens when there is no project
name *and* you are in a TTY (or when you pass `--menu` explicitly).

**Doctor says `gh` is missing but I do not need it.**
`gh` is optional — it is only required if you opt into `--github-create` at
the end of `bun run setup`. A `warn` row on `gh` will not block the scaffold.

**Inspect says a prerequisite is MISSING but doctor was happy.**
Inspect uses the **manifest's** prerequisite list (everything the downstream
installer touches), while doctor only checks the six universal binaries the
scaffolder itself needs. The wider list is expected to surface more gaps.

**ASCII banner mangles my CI logs.**
Pass `--no-banner` to suppress it. Combine with `--non-interactive` to also
disable prompts and the menu.

**Network error (exit 11) on a corporate network.**
The scaffolder reaches `https://codeload.github.com/...` for the tarball and
`https://api.github.com` for the doctor's internet check. If either is blocked,
set the standard `HTTPS_PROXY` env var before running.

## Local development / testing without npm publish

```bash
git clone https://github.com/upex-galaxy/agentic-qa-boilerplate
cd agentic-qa-boilerplate/packages/create-agentic-qa
bun install
bun run build

# Symlink the bin globally:
bun link

# Anywhere else on your machine:
create-agentic-qa test-app
```

To run directly from source without building:

```bash
bun run src/cli.ts test-app
```

## License

MIT — same as the parent repo.
