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

| Flag                           | Default                              | Description                                                                                                          |
| ------------------------------ | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `<project-name>`               | (required)                           | Target directory name. Required unless `--here` is passed.                                                           |
| `--here`                       | off                                  | Bootstrap into the current directory; or, if already inside a bootstrapped project, skip download and run setup only. |
| `--template <ref>`             | `main`                               | Branch / tag / SHA of the template repo to download.                                                                 |
| `--template-repo <owner/repo>` | `upex-galaxy/agentic-qa-boilerplate` | Override the upstream repository (useful for forks).                                                                 |
| `--project-key <KEY>`          | (prompted)                           | Jira project key (e.g. `UPEX`). Optional — leave blank to fill in later.                                             |
| `--no-install`                 | off                                  | Skip `bun install`.                                                                                                  |
| `--no-setup`                   | off                                  | Skip `bun run setup` — only download + git init.                                                                     |
| `--no-git`                     | off                                  | Skip `git init` + initial commit.                                                                                    |
| `--non-interactive`            | auto on no-TTY                       | Forwarded to the installer. Prompts use safe defaults.                                                               |
| `--help`, `-h`                 |                                      | Print help and exit.                                                                                                 |
| `--version`, `-v`              |                                      | Print CLI version and exit.                                                                                          |

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

| Tool  | Required for                                       |
| ----- | -------------------------------------------------- |
| `bun` | Running `bun install` + `bun run setup`            |
| `tar` | Extracting the template tarball                    |
| `git` | `git init` + initial commit                        |
| `gh`  | (optional) Creating a GitHub repository at the end |

The CLI checks for these up front and prints actionable install hints if any
are missing.

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