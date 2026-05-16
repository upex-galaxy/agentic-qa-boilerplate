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

## Flags

| Flag                           | Default                              | Description                                                                                                           |
| ------------------------------ | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `<project-name>`               | (required)                           | Target directory name. Required unless `--here` is passed.                                                            |
| `--here`                       | off                                  | Bootstrap into the current directory; or, if already inside a bootstrapped project, skip download and run setup only. |
| `--template <ref>`             | `main`                               | Branch / tag / SHA of the template repo to download.                                                                  |
| `--template-repo <owner/repo>` | `upex-galaxy/agentic-qa-boilerplate` | Override the upstream repository (useful for forks).                                                                  |
| `--project-key <KEY>`          | (prompted)                           | Jira project key (e.g. `UPEX`). Optional — leave blank to fill in later.                                              |
| `--no-install`                 | off                                  | Skip `bun install`.                                                                                                   |
| `--no-setup`                   | off                                  | Skip `bun run setup` — only download + git init.                                                                      |
| `--no-git`                     | off                                  | Skip `git init` + initial commit.                                                                                     |
| `--non-interactive`            | auto on no-TTY                       | Forwarded to the installer. Prompts use safe defaults.                                                                |
| `--help`, `-h`                 |                                      | Print help and exit.                                                                                                  |
| `--version`, `-v`              |                                      | Print CLI version and exit.                                                                                           |

## In-repo mode

If you already cloned `agentic-qa-boilerplate` manually, you can run the CLI
inside that folder:

```bash
cd existing-clone
bunx create-agentic-qa --here
```

The CLI detects the `.agents/template-marker.json` sentinel, skips the download
stage entirely, and jumps straight to the installer.

## What you get

A ready-to-use QA project wired for:

- **Playwright + KATA + TypeScript** test architecture (Layer 1-4 fixtures).
- **Skills-based AI workflows** — invoke `/agentic-qa-onboard` for a tour,
  `/project-discovery` to reverse-engineer your target app, `/adapt-framework`
  to wire KATA fixtures to your stack, and `/sprint-testing` for per-ticket
  manual QA.
- **MCPs preconfigured** for Playwright, OpenAPI, Atlassian (Jira/Xray),
  DBHub, Context7, and Tavily.

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
